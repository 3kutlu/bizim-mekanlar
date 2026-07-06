-- v3.1.0 — Public deep links + browser history route targets
--
-- The public identifiers below are opaque UUIDs. Internal sequential IDs stay
-- private to the app and never appear in share URLs.
-- User routes stay readable as /user/:username. Shared profile URLs also carry
-- the user's opaque PublicId in ?profile=<uuid>. This lets a renamed username
-- be reused by someone else while an old shared link safely resolves to the
-- standard not-found state instead of opening the new owner.

begin;

alter table public."Users"
  add column if not exists "PublicId" uuid;

alter table public."Places"
  add column if not exists "PublicId" uuid;

alter table public."PlaceNotes"
  add column if not exists "PublicId" uuid;

alter table public."UserPlaceLists"
  add column if not exists "PublicId" uuid;

update public."Users"
set "PublicId" = gen_random_uuid()
where "PublicId" is null;

update public."Places"
set "PublicId" = gen_random_uuid()
where "PublicId" is null;

update public."PlaceNotes"
set "PublicId" = gen_random_uuid()
where "PublicId" is null;

update public."UserPlaceLists"
set "PublicId" = gen_random_uuid()
where "PublicId" is null;

alter table public."Users"
  alter column "PublicId" set default gen_random_uuid(),
  alter column "PublicId" set not null;

alter table public."Places"
  alter column "PublicId" set default gen_random_uuid(),
  alter column "PublicId" set not null;

alter table public."PlaceNotes"
  alter column "PublicId" set default gen_random_uuid(),
  alter column "PublicId" set not null;

alter table public."UserPlaceLists"
  alter column "PublicId" set default gen_random_uuid(),
  alter column "PublicId" set not null;

create unique index if not exists "UX_Users_PublicId"
  on public."Users" ("PublicId");

create unique index if not exists "UX_Places_PublicId"
  on public."Places" ("PublicId");

create unique index if not exists "UX_PlaceNotes_PublicId"
  on public."PlaceNotes" ("PublicId");

create unique index if not exists "UX_UserPlaceLists_PublicId"
  on public."UserPlaceLists" ("PublicId");

drop function if exists public."GetUserDeepLinkTarget"(text);

create or replace function public."GetUserDeepLinkTarget"(
  p_username text,
  p_public_id uuid default null
)
returns table(
  "UserId" integer,
  "PublicId" uuid,
  "Username" text,
  "AccountVisibilityCode" text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public."GetMyActiveUserId"();

  return query
  select
    target_user."UserId",
    target_user."PublicId",
    target_user."Username"::text,
    visibility."Code"::text as "AccountVisibilityCode"
  from public."Users" as target_user
  join public."UserStatuses" as status
    on status."UserStatusId" = target_user."UserStatusId"
   and status."IsActive" = true
   and status."Code" = 'ACTIVE'
  join public."AccountVisibilityStatuses" as visibility
    on visibility."AccountVisibilityStatusId" = target_user."AccountVisibilityStatusId"
   and visibility."IsActive" = true
  where lower(target_user."Username") = lower(btrim(coalesce(p_username, '')))
    and (p_public_id is null or target_user."PublicId" = p_public_id)
    and target_user."IsActive" = true
    and coalesce(target_user."IsSystemUser", false) = false
  limit 1;
end;
$$;

create or replace function public."GetUserDeepLinkTargetById"(
  p_user_id integer
)
returns table(
  "UserId" integer,
  "PublicId" uuid,
  "Username" text,
  "AccountVisibilityCode" text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public."GetMyActiveUserId"();

  return query
  select
    target_user."UserId",
    target_user."PublicId",
    target_user."Username"::text,
    visibility."Code"::text as "AccountVisibilityCode"
  from public."Users" as target_user
  join public."UserStatuses" as status
    on status."UserStatusId" = target_user."UserStatusId"
   and status."IsActive" = true
   and status."Code" = 'ACTIVE'
  join public."AccountVisibilityStatuses" as visibility
    on visibility."AccountVisibilityStatusId" = target_user."AccountVisibilityStatusId"
   and visibility."IsActive" = true
  where target_user."UserId" = p_user_id
    and target_user."IsActive" = true
    and coalesce(target_user."IsSystemUser", false) = false
  limit 1;
end;
$$;

create or replace function public."GetPlaceDeepLinkTarget"(
  p_public_id uuid
)
returns table(
  "PlaceId" integer,
  "PublicId" uuid,
  "Name" text,
  "VenueCategoryCode" text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public."GetMyActiveUserId"();

  return query
  select
    place_row."PlaceId",
    place_row."PublicId",
    place_row."Name"::text,
    place_row."VenueCategoryCode"::text
  from public."Places" as place_row
  where place_row."PublicId" = p_public_id
    and place_row."IsActive" = true
  limit 1;
end;
$$;

create or replace function public."GetPlaceDeepLinkTargetById"(
  p_place_id integer
)
returns table(
  "PlaceId" integer,
  "PublicId" uuid,
  "Name" text,
  "VenueCategoryCode" text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public."GetMyActiveUserId"();

  return query
  select
    place_row."PlaceId",
    place_row."PublicId",
    place_row."Name"::text,
    place_row."VenueCategoryCode"::text
  from public."Places" as place_row
  where place_row."PlaceId" = p_place_id
    and place_row."IsActive" = true
  limit 1;
end;
$$;

create or replace function public."GetNoteDeepLinkTarget"(
  p_public_id uuid
)
returns table(
  "PlaceNoteId" integer,
  "PublicId" uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_place_note_id integer;
begin
  select note_row."PlaceNoteId"
  into v_place_note_id
  from public."PlaceNotes" as note_row
  where note_row."PublicId" = p_public_id
    and note_row."IsActive" = true
  limit 1;

  if v_place_note_id is null then
    return;
  end if;

  return query
  select
    visible_note."PlaceNoteId",
    note_row."PublicId"
  from public."GetPlaceNoteDetailV2"(v_place_note_id) as visible_note
  join public."PlaceNotes" as note_row
    on note_row."PlaceNoteId" = visible_note."PlaceNoteId"
  limit 1;
end;
$$;

create or replace function public."GetNoteDeepLinkTargetById"(
  p_place_note_id integer
)
returns table(
  "PlaceNoteId" integer,
  "PublicId" uuid
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    visible_note."PlaceNoteId",
    note_row."PublicId"
  from public."GetPlaceNoteDetailV2"(p_place_note_id) as visible_note
  join public."PlaceNotes" as note_row
    on note_row."PlaceNoteId" = visible_note."PlaceNoteId"
   and note_row."IsActive" = true
  limit 1;
end;
$$;

create or replace function public."GetCollectionDeepLinkTarget"(
  p_public_id uuid
)
returns table(
  "UserPlaceListId" bigint,
  "PublicId" uuid,
  "UserId" integer,
  "Username" text,
  "AccountVisibilityCode" text,
  "Name" text,
  "Description" text,
  "Icon" text,
  "VisibilityCode" text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_user_id integer;
  v_list_owner_user_id integer;
  v_can_view_collections boolean := false;
  v_list_visibility_code text;
begin
  v_current_user_id := public."GetMyActiveUserId"();

  select
    list_row."UserId",
    upper(coalesce(list_row."VisibilityCode", 'PRIVATE'))
  into
    v_list_owner_user_id,
    v_list_visibility_code
  from public."UserPlaceLists" as list_row
  where list_row."PublicId" = p_public_id
    and list_row."IsActive" = true
  limit 1;

  if v_list_owner_user_id is null then
    return;
  end if;

  if v_list_owner_user_id <> v_current_user_id then
    select coalesce(external_profile."CanViewCollections", false)
    into v_can_view_collections
    from public."GetExternalUserProfile"(v_list_owner_user_id) as external_profile
    limit 1;

    if not coalesce(v_can_view_collections, false)
      or v_list_visibility_code <> 'PUBLIC' then
      return;
    end if;
  end if;

  return query
  select
    list_row."UserPlaceListId",
    list_row."PublicId",
    owner_user."UserId",
    owner_user."Username"::text,
    visibility."Code"::text as "AccountVisibilityCode",
    list_row."Name"::text,
    list_row."Description"::text,
    list_row."Icon"::text,
    list_row."VisibilityCode"::text
  from public."UserPlaceLists" as list_row
  join public."Users" as owner_user
    on owner_user."UserId" = list_row."UserId"
   and owner_user."IsActive" = true
  join public."AccountVisibilityStatuses" as visibility
    on visibility."AccountVisibilityStatusId" = owner_user."AccountVisibilityStatusId"
   and visibility."IsActive" = true
  where list_row."PublicId" = p_public_id
    and list_row."IsActive" = true
  limit 1;
end;
$$;

create or replace function public."GetCollectionDeepLinkTargetById"(
  p_user_place_list_id bigint
)
returns table(
  "UserPlaceListId" bigint,
  "PublicId" uuid,
  "UserId" integer,
  "Username" text,
  "AccountVisibilityCode" text,
  "Name" text,
  "Description" text,
  "Icon" text,
  "VisibilityCode" text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_public_id uuid;
begin
  select list_row."PublicId"
  into v_public_id
  from public."UserPlaceLists" as list_row
  where list_row."UserPlaceListId" = p_user_place_list_id
    and list_row."IsActive" = true
  limit 1;

  if v_public_id is null then
    return;
  end if;

  return query
  select *
  from public."GetCollectionDeepLinkTarget"(v_public_id);
end;
$$;

grant execute on function public."GetUserDeepLinkTarget"(text, uuid) to authenticated;
grant execute on function public."GetUserDeepLinkTargetById"(integer) to authenticated;
grant execute on function public."GetPlaceDeepLinkTarget"(uuid) to authenticated;
grant execute on function public."GetPlaceDeepLinkTargetById"(integer) to authenticated;
grant execute on function public."GetNoteDeepLinkTarget"(uuid) to authenticated;
grant execute on function public."GetNoteDeepLinkTargetById"(integer) to authenticated;
grant execute on function public."GetCollectionDeepLinkTarget"(uuid) to authenticated;
grant execute on function public."GetCollectionDeepLinkTargetById"(bigint) to authenticated;

commit;
