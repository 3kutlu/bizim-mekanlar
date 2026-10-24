alter table public."UserPlaceListItems"
  add column if not exists "Note" varchar(500);

drop function if exists public."GetUserPlaceListItemNotes"(bigint);

create function public."GetUserPlaceListItemNotes"(
  p_user_place_list_id bigint
)
returns table (
  "UserPlaceListItemId" bigint,
  "PlaceId" bigint,
  "ListNote" text,
  "AddedByUserId" bigint,
  "CanEditListNote" boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_user_id bigint;
begin
  select u."UserId"::bigint
    into v_current_user_id
  from public."Users" u
  where u."AuthUserId" = auth.uid()
    and u."IsActive" = true
  limit 1;

  return query
  with visible_items as (
    select distinct visible."PlaceId"::bigint as "PlaceId"
    from public."GetUserPlaceListItemsV3"(p_user_place_list_id) visible
  )
  select
    item."UserPlaceListItemId"::bigint,
    item."PlaceId"::bigint,
    nullif(btrim(item."Note"), '')::text,
    item."AddedByUserId"::bigint,
    (
      v_current_user_id is not null
      and (
        list."UserId"::bigint = v_current_user_id
        or item."AddedByUserId"::bigint = v_current_user_id
      )
    ) as "CanEditListNote"
  from public."UserPlaceListItems" item
  join public."UserPlaceLists" list
    on list."UserPlaceListId" = item."UserPlaceListId"
  join visible_items visible
    on visible."PlaceId" = item."PlaceId"::bigint
  where item."UserPlaceListId" = p_user_place_list_id
    and list."IsActive" = true;
end;
$$;

revoke all on function public."GetUserPlaceListItemNotes"(bigint) from public;
grant execute on function public."GetUserPlaceListItemNotes"(bigint) to authenticated;

drop function if exists public."UpdateMyPlaceListItemNote"(bigint, bigint, text);

create function public."UpdateMyPlaceListItemNote"(
  p_user_place_list_id bigint,
  p_place_id bigint,
  p_note text
)
returns table (
  "UserPlaceListItemId" bigint,
  "PlaceId" bigint,
  "ListNote" text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_user_id bigint;
  v_normalized_note text;
begin
  select u."UserId"::bigint
    into v_current_user_id
  from public."Users" u
  where u."AuthUserId" = auth.uid()
    and u."IsActive" = true
  limit 1;

  if v_current_user_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'Aktif kullanıcı bulunamadı.';
  end if;

  v_normalized_note := nullif(btrim(coalesce(p_note, '')), '');

  if char_length(coalesce(v_normalized_note, '')) > 500 then
    raise exception using
      errcode = '22001',
      message = 'Koleksiyon notu en fazla 500 karakter olabilir.';
  end if;

  if not exists (
    select 1
    from public."UserPlaceListItems" item
    join public."UserPlaceLists" list
      on list."UserPlaceListId" = item."UserPlaceListId"
    where item."UserPlaceListId" = p_user_place_list_id
      and item."PlaceId" = p_place_id
      and list."IsActive" = true
      and (
        list."UserId"::bigint = v_current_user_id
        or item."AddedByUserId"::bigint = v_current_user_id
      )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'Bu mekanın koleksiyon notunu düzenleme yetkin yok.';
  end if;

  return query
  update public."UserPlaceListItems" item
  set
    "Note" = v_normalized_note,
    "UpdatedDate" = now()
  where item."UserPlaceListId" = p_user_place_list_id
    and item."PlaceId" = p_place_id
  returning
    item."UserPlaceListItemId"::bigint,
    item."PlaceId"::bigint,
    nullif(btrim(item."Note"), '')::text;
end;
$$;

revoke all on function public."UpdateMyPlaceListItemNote"(bigint, bigint, text) from public;
grant execute on function public."UpdateMyPlaceListItemNote"(bigint, bigint, text) to authenticated;

drop function if exists public."GetUserPlaceListMapItems"(bigint);

create function public."GetUserPlaceListMapItems"(
  p_user_place_list_id bigint
)
returns table (
  "PlaceId" bigint,
  "GooglePlaceId" text,
  "Name" text,
  "FormattedAddress" text,
  "CityName" text,
  "PostalCode" text,
  "VenueCategoryCode" text,
  "Latitude" double precision,
  "Longitude" double precision,
  "VisibleNoteCount" bigint
)
language sql
security definer
set search_path = ''
stable
as $$
  with visible_items as (
    select distinct visible."PlaceId"::bigint as "PlaceId"
    from public."GetUserPlaceListItemsV3"(p_user_place_list_id) visible
  )
  select
    place."PlaceId"::bigint,
    place."GooglePlaceId"::text,
    place."Name"::text,
    place."FormattedAddress"::text,
    city."Name"::text as "CityName",
    place."PostalCode"::text,
    place."VenueCategoryCode"::text,
    place."Latitude"::double precision,
    place."Longitude"::double precision,
    0::bigint as "VisibleNoteCount"
  from visible_items visible
  join public."Places" place
    on place."PlaceId"::bigint = visible."PlaceId"
   and place."IsActive" = true
  left join public."Cities" city
    on city."CityId" = place."CityId"
  order by place."Name";
$$;

revoke all on function public."GetUserPlaceListMapItems"(bigint) from public;
grant execute on function public."GetUserPlaceListMapItems"(bigint) to authenticated;
