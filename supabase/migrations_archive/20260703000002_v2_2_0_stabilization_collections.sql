-- Remote Supabase migration history exportundan yeniden oluşturuldu.
-- Version: 20260703000002
-- Name: v2_2_0_stabilization_collections
-- Bu dosyanın version/name değeri remote schema_migrations kaydıyla eşleşmelidir.

-- Statement 1/16
-- Bizim Mekanlar v2.2.0
-- Stabilization + collection enrichment
-- Safe to run once on the current v2.1.1 database.

begin;

-- Statement 2/16
-- A collection cover reuses an existing active note photo owned by the list owner.
alter table public."UserPlaceLists"
  add column if not exists "CoverPlaceNotePhotoId" bigint null;

-- Statement 3/16
DO $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'UserPlaceLists_CoverPlaceNotePhotoId_fkey'
      and conrelid = 'public."UserPlaceLists"'::regclass
  ) then
    alter table public."UserPlaceLists"
      add constraint "UserPlaceLists_CoverPlaceNotePhotoId_fkey"
      foreign key ("CoverPlaceNotePhotoId")
      references public."PlaceNotePhotos"("PlaceNotePhotoId")
      on delete set null;
  end if;
end;
$$;

-- Statement 4/16
create index if not exists "IX_UserPlaceLists_CoverPlaceNotePhoto"
  on public."UserPlaceLists" ("CoverPlaceNotePhotoId")
  where "CoverPlaceNotePhotoId" is not null;

-- Statement 5/16
-- Preserve edits made by users to system-list names/icons. We only backfill the
-- new descriptions and restore inactive system presets.
create or replace function public."EnsureMyPlaceLists"()
returns void
language plpgsql
set search_path to 'public'
as $function$
declare
  v_user_id integer;
begin
  v_user_id := public."GetMyActiveUserId"();

  insert into public."UserPlaceLists" (
    "UserId",
    "ListCode",
    "Name",
    "Description",
    "Icon",
    "SortOrder",
    "IsSystem",
    "IsActive",
    "VisibilityCode"
  )
  values
    (v_user_id, 'WANT_TO_GO', 'Gitmek istiyorum', 'Merak ettiğim ve gitmek istediğim mekanlar.', '✦', 10, true, true, 'PUBLIC'),
    (v_user_id, 'FAVORITES', 'Favoriler', 'Tekrar dönmek isteyeceğim favori mekanlarım.', '♥', 20, true, true, 'PRIVATE'),
    (v_user_id, 'GO_AGAIN', 'Tekrar giderim', 'İlk fırsatta yeniden uğramak istediğim mekanlar.', '↻', 30, true, true, 'PRIVATE'),
    (v_user_id, 'AVOID', 'Bir daha gitmem', 'Kendime not: tekrar tercih etmeyeceğim mekanlar.', '−', 40, true, true, 'PRIVATE')
  on conflict ("UserId", "ListCode") where "ListCode" is not null
  do update
  set
    "Description" = coalesce(
      nullif(btrim(public."UserPlaceLists"."Description"), ''),
      excluded."Description"
    ),
    "SortOrder" = excluded."SortOrder",
    "IsSystem" = true,
    "IsActive" = true,
    "UpdatedDate" = timezone('utc', now())
  where public."UserPlaceLists"."IsSystem" = true;
end;
$function$;

-- Statement 6/16
create or replace function public."GetMyPlaceListsV3"()
returns table(
  "UserPlaceListId" bigint,
  "ListCode" text,
  "Name" character varying,
  "Description" character varying,
  "Icon" character varying,
  "SortOrder" smallint,
  "IsSystem" boolean,
  "VisibilityCode" text,
  "CoverPlaceNotePhotoId" bigint,
  "CoverStoragePath" text,
  "PlaceCount" bigint
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id integer;
begin
  v_user_id := public."GetMyActiveUserId"();
  perform public."EnsureMyPlaceLists"();

  return query
  select
    l."UserPlaceListId",
    l."ListCode",
    l."Name",
    l."Description",
    l."Icon",
    l."SortOrder",
    l."IsSystem",
    upper(coalesce(l."VisibilityCode", 'PRIVATE'))::text as "VisibilityCode",
    l."CoverPlaceNotePhotoId",
    cover."StoragePath"::text as "CoverStoragePath",
    count(list_item."UserPlaceListItemId")::bigint as "PlaceCount"
  from public."UserPlaceLists" as l
  left join public."UserPlaceListItems" as list_item
    on list_item."UserPlaceListId" = l."UserPlaceListId"
  left join public."PlaceNotePhotos" as cover
    on cover."PlaceNotePhotoId" = l."CoverPlaceNotePhotoId"
   and cover."UserId" = l."UserId"
   and cover."IsActive" = true
  where l."UserId" = v_user_id
    and l."IsActive" = true
  group by
    l."UserPlaceListId",
    l."ListCode",
    l."Name",
    l."Description",
    l."Icon",
    l."SortOrder",
    l."IsSystem",
    l."VisibilityCode",
    l."CoverPlaceNotePhotoId",
    cover."StoragePath"
  order by l."SortOrder", l."UserPlaceListId";
end;
$function$;

-- Statement 7/16
create or replace function public."GetVisibleUserPlaceListsV3"(p_profile_user_id integer)
returns table(
  "UserPlaceListId" bigint,
  "ListCode" text,
  "Name" character varying,
  "Description" character varying,
  "Icon" character varying,
  "SortOrder" smallint,
  "IsSystem" boolean,
  "VisibilityCode" text,
  "CoverPlaceNotePhotoId" bigint,
  "CoverStoragePath" text,
  "PlaceCount" bigint
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_current_user_id integer;
  v_can_view_collections boolean := false;
begin
  if p_profile_user_id is null or p_profile_user_id <= 0 then
    return;
  end if;

  v_current_user_id := public."GetMyActiveUserId"();

  if p_profile_user_id = v_current_user_id then
    perform public."EnsureMyPlaceLists"();

    return query
    select *
    from public."GetMyPlaceListsV3"();
    return;
  end if;

  select coalesce(external_profile."CanViewCollections", false)
    into v_can_view_collections
  from public."GetExternalUserProfile"(p_profile_user_id) as external_profile
  limit 1;

  if not coalesce(v_can_view_collections, false) then
    return;
  end if;

  return query
  select
    l."UserPlaceListId",
    l."ListCode",
    l."Name",
    l."Description",
    l."Icon",
    l."SortOrder",
    l."IsSystem",
    upper(coalesce(l."VisibilityCode", 'PRIVATE'))::text as "VisibilityCode",
    l."CoverPlaceNotePhotoId",
    cover."StoragePath"::text as "CoverStoragePath",
    count(list_item."UserPlaceListItemId")::bigint as "PlaceCount"
  from public."UserPlaceLists" as l
  left join public."UserPlaceListItems" as list_item
    on list_item."UserPlaceListId" = l."UserPlaceListId"
  left join public."PlaceNotePhotos" as cover
    on cover."PlaceNotePhotoId" = l."CoverPlaceNotePhotoId"
   and cover."UserId" = l."UserId"
   and cover."IsActive" = true
  where l."UserId" = p_profile_user_id
    and l."IsActive" = true
    and upper(coalesce(l."VisibilityCode", 'PRIVATE')) = 'PUBLIC'
  group by
    l."UserPlaceListId",
    l."ListCode",
    l."Name",
    l."Description",
    l."Icon",
    l."SortOrder",
    l."IsSystem",
    l."VisibilityCode",
    l."CoverPlaceNotePhotoId",
    cover."StoragePath"
  order by l."SortOrder", l."UserPlaceListId";
end;
$function$;

-- Statement 8/16
create or replace function public."GetMyPlaceListsForPlaceV3"(p_google_place_id text)
returns table(
  "UserPlaceListId" bigint,
  "ListCode" text,
  "Name" text,
  "Description" text,
  "Icon" text,
  "VisibilityCode" text,
  "PlaceCount" bigint,
  "IsSaved" boolean
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id integer;
  v_google_place_id text := btrim(coalesce(p_google_place_id, ''));
begin
  if v_google_place_id = '' then
    raise exception 'Mekan bilgisi eksik.';
  end if;

  v_user_id := public."GetMyActiveUserId"();
  perform public."EnsureMyPlaceLists"();

  return query
  select
    l."UserPlaceListId",
    l."ListCode",
    l."Name"::text,
    l."Description"::text,
    l."Icon"::text,
    upper(coalesce(l."VisibilityCode", 'PRIVATE'))::text as "VisibilityCode",
    count(list_item."UserPlaceListItemId")::bigint as "PlaceCount",
    exists (
      select 1
      from public."UserPlaceListItems" as saved_item
      inner join public."Places" as saved_place
        on saved_place."PlaceId" = saved_item."PlaceId"
      where saved_item."UserPlaceListId" = l."UserPlaceListId"
        and saved_place."GooglePlaceId" = v_google_place_id
        and saved_place."IsActive" = true
    ) as "IsSaved"
  from public."UserPlaceLists" as l
  left join public."UserPlaceListItems" as list_item
    on list_item."UserPlaceListId" = l."UserPlaceListId"
  where l."UserId" = v_user_id
    and l."IsActive" = true
  group by
    l."UserPlaceListId",
    l."ListCode",
    l."Name",
    l."Description",
    l."Icon",
    l."VisibilityCode",
    l."SortOrder"
  order by l."SortOrder", l."UserPlaceListId";
end;
$function$;

-- Statement 9/16
create or replace function public."GetMyPlaceListCoverOptions"(p_user_place_list_id bigint)
returns table(
  "PlaceNotePhotoId" bigint,
  "PlaceNoteId" integer,
  "PlaceId" integer,
  "PlaceName" text,
  "NoteTitle" text,
  "StoragePath" text,
  "CreatedDate" timestamp with time zone
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id integer;
begin
  if p_user_place_list_id is null or p_user_place_list_id <= 0 then
    raise exception 'Geçerli bir liste seçmelisin.';
  end if;

  v_user_id := public."GetMyActiveUserId"();

  if not exists (
    select 1
    from public."UserPlaceLists" as list_row
    where list_row."UserPlaceListId" = p_user_place_list_id
      and list_row."UserId" = v_user_id
      and list_row."IsActive" = true
  ) then
    raise exception 'Liste bulunamadı veya bu listeyi düzenleme yetkin yok.';
  end if;

  return query
  select
    photo."PlaceNotePhotoId",
    photo."PlaceNoteId",
    note."PlaceId",
    place."Name"::text as "PlaceName",
    note."Title"::text as "NoteTitle",
    photo."StoragePath"::text,
    photo."CreatedDate"
  from public."UserPlaceListItems" as list_item
  inner join public."PlaceNotes" as note
    on note."PlaceId" = list_item."PlaceId"
   and note."UserId" = v_user_id
   and note."IsActive" = true
  inner join public."PlaceNotePhotos" as photo
    on photo."PlaceNoteId" = note."PlaceNoteId"
   and photo."UserId" = v_user_id
   and photo."IsActive" = true
  inner join public."Places" as place
    on place."PlaceId" = note."PlaceId"
   and place."IsActive" = true
  where list_item."UserPlaceListId" = p_user_place_list_id
  order by photo."CreatedDate" desc, photo."PlaceNotePhotoId" desc;
end;
$function$;

-- Statement 10/16
create or replace function public."CreateMyPlaceListV2"(
  p_name text,
  p_description text default null,
  p_icon text default null,
  p_visibility_code text default 'PRIVATE'
)
returns table(
  "UserPlaceListId" bigint,
  "ListCode" text,
  "Name" character varying,
  "Description" character varying,
  "Icon" character varying,
  "SortOrder" smallint,
  "IsSystem" boolean,
  "VisibilityCode" text,
  "CoverPlaceNotePhotoId" bigint,
  "CoverStoragePath" text,
  "PlaceCount" bigint
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id integer;
  v_name text := btrim(coalesce(p_name, ''));
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
  v_icon text := nullif(btrim(coalesce(p_icon, '')), '');
  v_visibility_code text := upper(btrim(coalesce(p_visibility_code, 'PRIVATE')));
  v_list_id bigint;
  v_sort_order smallint;
begin
  if char_length(v_name) < 1 or char_length(v_name) > 60 then
    raise exception using
      errcode = 'P0001',
      message = 'Application error',
      detail = 'APP_ERROR:COLLECTION_NAME_INVALID';
  end if;

  if v_description is not null and char_length(v_description) > 180 then
    raise exception using
      errcode = 'P0001',
      message = 'Application error',
      detail = 'APP_ERROR:COLLECTION_DESCRIPTION_INVALID';
  end if;

  if v_icon is not null and char_length(v_icon) > 12 then
    raise exception using
      errcode = 'P0001',
      message = 'Application error',
      detail = 'APP_ERROR:COLLECTION_ICON_INVALID';
  end if;

  if v_visibility_code not in ('PUBLIC', 'PRIVATE') then
    raise exception using
      errcode = 'P0001',
      message = 'Application error',
      detail = 'APP_ERROR:COLLECTION_VISIBILITY_INVALID';
  end if;

  v_user_id := public."GetMyActiveUserId"();

  if exists (
    select 1
    from public."UserPlaceLists" as existing_list
    where existing_list."UserId" = v_user_id
      and lower(existing_list."Name") = lower(v_name)
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'Application error',
      detail = 'APP_ERROR:COLLECTION_NAME_EXISTS';
  end if;

  select least(32767, coalesce(max("SortOrder"), 0) + 10)::smallint
    into v_sort_order
  from public."UserPlaceLists"
  where "UserId" = v_user_id;

  insert into public."UserPlaceLists" (
    "UserId", "ListCode", "Name", "Description", "Icon", "SortOrder",
    "IsSystem", "IsActive", "VisibilityCode"
  ) values (
    v_user_id, null, v_name, v_description, coalesce(v_icon, '✦'), v_sort_order,
    false, true, v_visibility_code
  )
  returning "UserPlaceListId" into v_list_id;

  return query
  select
    l."UserPlaceListId", l."ListCode", l."Name", l."Description", l."Icon",
    l."SortOrder", l."IsSystem", l."VisibilityCode", l."CoverPlaceNotePhotoId",
    null::text as "CoverStoragePath", 0::bigint as "PlaceCount"
  from public."UserPlaceLists" as l
  where l."UserPlaceListId" = v_list_id;
exception
  when unique_violation then
    raise exception using
      errcode = 'P0001',
      message = 'Application error',
      detail = 'APP_ERROR:COLLECTION_NAME_EXISTS';
end;
$function$;

-- Statement 11/16
create or replace function public."UpdateMyPlaceListV2"(
  p_user_place_list_id bigint,
  p_name text,
  p_description text default null,
  p_icon text default null,
  p_visibility_code text default 'PRIVATE',
  p_cover_place_note_photo_id bigint default null
)
returns table(
  "UserPlaceListId" bigint,
  "ListCode" text,
  "Name" character varying,
  "Description" character varying,
  "Icon" character varying,
  "SortOrder" smallint,
  "IsSystem" boolean,
  "VisibilityCode" text,
  "CoverPlaceNotePhotoId" bigint,
  "CoverStoragePath" text,
  "PlaceCount" bigint
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id integer;
  v_name text := btrim(coalesce(p_name, ''));
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
  v_icon text := nullif(btrim(coalesce(p_icon, '')), '');
  v_visibility_code text := upper(btrim(coalesce(p_visibility_code, 'PRIVATE')));
begin
  if p_user_place_list_id is null or p_user_place_list_id <= 0 then
    raise exception using errcode = 'P0001', message = 'Application error', detail = 'APP_ERROR:COLLECTION_NOT_FOUND';
  end if;

  if char_length(v_name) < 1 or char_length(v_name) > 60 then
    raise exception using errcode = 'P0001', message = 'Application error', detail = 'APP_ERROR:COLLECTION_NAME_INVALID';
  end if;

  if v_description is not null and char_length(v_description) > 180 then
    raise exception using errcode = 'P0001', message = 'Application error', detail = 'APP_ERROR:COLLECTION_DESCRIPTION_INVALID';
  end if;

  if v_icon is not null and char_length(v_icon) > 12 then
    raise exception using errcode = 'P0001', message = 'Application error', detail = 'APP_ERROR:COLLECTION_ICON_INVALID';
  end if;

  if v_visibility_code not in ('PUBLIC', 'PRIVATE') then
    raise exception using errcode = 'P0001', message = 'Application error', detail = 'APP_ERROR:COLLECTION_VISIBILITY_INVALID';
  end if;

  v_user_id := public."GetMyActiveUserId"();

  if not exists (
    select 1
    from public."UserPlaceLists" as list_row
    where list_row."UserPlaceListId" = p_user_place_list_id
      and list_row."UserId" = v_user_id
      and list_row."IsActive" = true
  ) then
    raise exception using errcode = 'P0001', message = 'Application error', detail = 'APP_ERROR:COLLECTION_NOT_FOUND';
  end if;

  if exists (
    select 1
    from public."UserPlaceLists" as other_list
    where other_list."UserId" = v_user_id
      and other_list."UserPlaceListId" <> p_user_place_list_id
      and lower(other_list."Name") = lower(v_name)
  ) then
    raise exception using errcode = 'P0001', message = 'Application error', detail = 'APP_ERROR:COLLECTION_NAME_EXISTS';
  end if;

  if p_cover_place_note_photo_id is not null and not exists (
    select 1
    from public."PlaceNotePhotos" as photo
    inner join public."PlaceNotes" as note
      on note."PlaceNoteId" = photo."PlaceNoteId"
     and note."UserId" = v_user_id
     and note."IsActive" = true
    inner join public."UserPlaceListItems" as list_item
      on list_item."PlaceId" = note."PlaceId"
     and list_item."UserPlaceListId" = p_user_place_list_id
    where photo."PlaceNotePhotoId" = p_cover_place_note_photo_id
      and photo."UserId" = v_user_id
      and photo."IsActive" = true
  ) then
    raise exception using errcode = 'P0001', message = 'Application error', detail = 'APP_ERROR:COLLECTION_COVER_INVALID';
  end if;

  update public."UserPlaceLists"
  set
    "Name" = v_name,
    "Description" = v_description,
    "Icon" = coalesce(v_icon, "Icon", '✦'),
    "VisibilityCode" = v_visibility_code,
    "CoverPlaceNotePhotoId" = p_cover_place_note_photo_id,
    "UpdatedDate" = timezone('utc', now())
  where "UserPlaceListId" = p_user_place_list_id
    and "UserId" = v_user_id
    and "IsActive" = true;

  return query
  select
    l."UserPlaceListId", l."ListCode", l."Name", l."Description", l."Icon",
    l."SortOrder", l."IsSystem", l."VisibilityCode", l."CoverPlaceNotePhotoId",
    cover."StoragePath"::text as "CoverStoragePath",
    count(list_item."UserPlaceListItemId")::bigint as "PlaceCount"
  from public."UserPlaceLists" as l
  left join public."PlaceNotePhotos" as cover
    on cover."PlaceNotePhotoId" = l."CoverPlaceNotePhotoId"
   and cover."UserId" = l."UserId"
   and cover."IsActive" = true
  left join public."UserPlaceListItems" as list_item
    on list_item."UserPlaceListId" = l."UserPlaceListId"
  where l."UserPlaceListId" = p_user_place_list_id
  group by
    l."UserPlaceListId", l."ListCode", l."Name", l."Description", l."Icon",
    l."SortOrder", l."IsSystem", l."VisibilityCode", l."CoverPlaceNotePhotoId", cover."StoragePath";
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'Application error', detail = 'APP_ERROR:COLLECTION_NAME_EXISTS';
end;
$function$;

-- Statement 12/16
create or replace function public."DeleteMyPlaceListV2"(p_user_place_list_id bigint)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id integer;
begin
  if p_user_place_list_id is null or p_user_place_list_id <= 0 then
    raise exception using errcode = 'P0001', message = 'Application error', detail = 'APP_ERROR:COLLECTION_NOT_FOUND';
  end if;

  v_user_id := public."GetMyActiveUserId"();

  if exists (
    select 1
    from public."UserPlaceLists" as list_row
    where list_row."UserPlaceListId" = p_user_place_list_id
      and list_row."UserId" = v_user_id
      and list_row."IsActive" = true
      and list_row."IsSystem" = true
  ) then
    raise exception using errcode = 'P0001', message = 'Application error', detail = 'APP_ERROR:COLLECTION_SYSTEM_DELETE_BLOCKED';
  end if;

  delete from public."UserPlaceLists"
  where "UserPlaceListId" = p_user_place_list_id
    and "UserId" = v_user_id
    and "IsActive" = true
    and "IsSystem" = false;

  if not found then
    raise exception using errcode = 'P0001', message = 'Application error', detail = 'APP_ERROR:COLLECTION_NOT_FOUND';
  end if;
end;
$function$;

-- Statement 13/16
-- Keep server-side date guards aligned with Turkey. The frontend also uses this
-- same calendar for date inputs, so users do not hit an edge-case after midnight.
alter function public."CreatePlaceNoteWithReviewV2"(
  text, text, text, text, text, double precision, double precision,
  text, text, integer, text
) set timezone to 'Europe/Istanbul';

-- Statement 14/16
alter function public."CreatePlaceNoteWithReviewV3"(
  text, text, text, text, text, double precision, double precision,
  text, text, integer, text, date
) set timezone to 'Europe/Istanbul';

-- Statement 15/16
alter function public."UpdateMyPlaceNote"(integer, text, integer, text, date)
  set timezone to 'Europe/Istanbul';

-- Statement 16/16
commit;
