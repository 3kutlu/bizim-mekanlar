-- Bizim Mekanlar v2.10.0
-- Cursor-paginated following/discovery feeds. The following wrapper keeps the
-- existing visibility contract intact; discovery is limited to active public
-- accounts and applies block/mute rules in the database.

create index if not exists "IX_PlaceNotes_ActiveFeedCursor"
  on public."PlaceNotes" ("CreatedDate" desc, "PlaceNoteId" desc)
  where "IsActive" = true;

create or replace function public."GetFollowingFeedNoteCardsPageV1"(
  p_limit integer default 20,
  p_cursor_created_date timestamptz default null,
  p_cursor_place_note_id integer default null
)
returns table(
  "PlaceNoteId" integer,
  "UserId" integer,
  "Username" text,
  "AccountVisibilityCode" text,
  "PlaceId" integer,
  "PlaceName" text,
  "VenueCategoryCode" text,
  "Title" text,
  "Rating" numeric,
  "CreatedDate" timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    feed_row."PlaceNoteId"::integer,
    feed_row."UserId"::integer,
    feed_row."Username"::text,
    feed_row."AccountVisibilityCode"::text,
    feed_row."PlaceId"::integer,
    feed_row."PlaceName"::text,
    feed_row."VenueCategoryCode"::text,
    feed_row."Title"::text,
    feed_row."Rating"::numeric,
    feed_row."CreatedDate"::timestamptz
  from public."GetFollowingFeedNoteCardsV2"() as feed_row
  where p_cursor_created_date is null
     or feed_row."CreatedDate"::timestamptz < p_cursor_created_date
     or (
       feed_row."CreatedDate"::timestamptz = p_cursor_created_date
       and feed_row."PlaceNoteId"::integer < coalesce(p_cursor_place_note_id, 2147483647)
     )
  order by
    feed_row."CreatedDate"::timestamptz desc,
    feed_row."PlaceNoteId"::integer desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

create or replace function public."GetDiscoverFeedNoteCardsPageV1"(
  p_limit integer default 20,
  p_cursor_created_date timestamptz default null,
  p_cursor_place_note_id integer default null
)
returns table(
  "PlaceNoteId" integer,
  "UserId" integer,
  "Username" text,
  "AccountVisibilityCode" text,
  "PlaceId" integer,
  "PlaceName" text,
  "VenueCategoryCode" text,
  "Title" text,
  "Rating" numeric,
  "CreatedDate" timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_viewer_user_id integer;
begin
  v_viewer_user_id := public."GetMyActiveUserId"();

  return query
  select
    note_row."PlaceNoteId"::integer,
    owner_user."UserId"::integer,
    owner_user."Username"::text,
    visibility."Code"::text,
    place_row."PlaceId"::integer,
    place_row."Name"::text,
    place_row."VenueCategoryCode"::text,
    note_row."Title"::text,
    note_row."Rating"::numeric,
    note_row."CreatedDate"::timestamptz
  from public."PlaceNotes" as note_row
  join public."Users" as owner_user
    on owner_user."UserId" = note_row."UserId"
   and owner_user."IsActive" = true
   and coalesce(owner_user."AccountStatus", 'ACTIVE') = 'ACTIVE'
   and coalesce(owner_user."IsSystemUser", false) = false
  join public."UserStatuses" as user_status
    on user_status."UserStatusId" = owner_user."UserStatusId"
   and user_status."IsActive" = true
   and upper(coalesce(user_status."Code", '')) = 'ACTIVE'
  join public."AccountVisibilityStatuses" as visibility
    on visibility."AccountVisibilityStatusId" = owner_user."AccountVisibilityStatusId"
   and visibility."IsActive" = true
   and upper(coalesce(visibility."Code", '')) = 'PUBLIC'
  join public."Places" as place_row
    on place_row."PlaceId" = note_row."PlaceId"
   and place_row."IsActive" = true
  where note_row."IsActive" = true
    and (
      p_cursor_created_date is null
      or note_row."CreatedDate"::timestamptz < p_cursor_created_date
      or (
        note_row."CreatedDate"::timestamptz = p_cursor_created_date
        and note_row."PlaceNoteId" < coalesce(p_cursor_place_note_id, 2147483647)
      )
    )
    and not exists (
      select 1
      from public."UserBlocks" as block_row
      where block_row."IsActive" = true
        and (
          (
            block_row."BlockerUserId" = v_viewer_user_id
            and block_row."BlockedUserId" = owner_user."UserId"
          )
          or (
            block_row."BlockerUserId" = owner_user."UserId"
            and block_row."BlockedUserId" = v_viewer_user_id
          )
        )
    )
    and not exists (
      select 1
      from public."UserMutes" as mute_row
      where mute_row."MuterUserId" = v_viewer_user_id
        and mute_row."MutedUserId" = owner_user."UserId"
        and mute_row."IsActive" = true
    )
  order by note_row."CreatedDate" desc, note_row."PlaceNoteId" desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
end;
$$;

comment on function public."GetFollowingFeedNoteCardsPageV1"(
  integer,
  timestamptz,
  integer
) is 'Returns one cursor-paginated page from the existing following feed visibility contract.';

comment on function public."GetDiscoverFeedNoteCardsPageV1"(
  integer,
  timestamptz,
  integer
) is 'Returns active notes from public accounts with block and mute filtering.';

revoke all on function public."GetFollowingFeedNoteCardsPageV1"(
  integer,
  timestamptz,
  integer
) from public;

revoke all on function public."GetDiscoverFeedNoteCardsPageV1"(
  integer,
  timestamptz,
  integer
) from public;

grant execute on function public."GetFollowingFeedNoteCardsPageV1"(
  integer,
  timestamptz,
  integer
) to authenticated;

grant execute on function public."GetDiscoverFeedNoteCardsPageV1"(
  integer,
  timestamptz,
  integer
) to authenticated;
