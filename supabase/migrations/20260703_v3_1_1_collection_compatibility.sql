-- v3.1.1 — collection compatibility for databases that skipped v2.2.0
--
-- v3.1.0's routed UI expects the V3 collection RPC result shape. Some
-- installations intentionally stayed on the earlier collection schema, where
-- cover-photo fields and the V3 functions do not exist. This migration creates
-- compatible wrappers only when that newer schema is absent. It does not add a
-- bucket, change RLS, or require collection-cover columns.

begin;

do $do$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'UserPlaceLists'
      and column_name = 'CoverPlaceNotePhotoId'
  ) then
    execute $create$
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
      language sql
      security definer
      set search_path to 'public'
      as $fn$
        select
          list_row."UserPlaceListId",
          list_row."ListCode",
          list_row."Name",
          list_row."Description",
          list_row."Icon",
          list_row."SortOrder",
          list_row."IsSystem",
          list_row."VisibilityCode",
          null::bigint as "CoverPlaceNotePhotoId",
          null::text as "CoverStoragePath",
          list_row."PlaceCount"
        from public."GetMyPlaceListsV2"() as list_row;
      $fn$;
    $create$;

    execute $create$
      create or replace function public."GetVisibleUserPlaceListsV3"(
        p_profile_user_id integer
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
      language sql
      security definer
      set search_path to 'public'
      as $fn$
        select
          list_row."UserPlaceListId",
          list_row."ListCode",
          list_row."Name",
          list_row."Description",
          list_row."Icon",
          list_row."SortOrder",
          list_row."IsSystem",
          list_row."VisibilityCode",
          null::bigint as "CoverPlaceNotePhotoId",
          null::text as "CoverStoragePath",
          list_row."PlaceCount"
        from public."GetVisibleUserPlaceListsV2"(p_profile_user_id) as list_row;
      $fn$;
    $create$;

    execute $create$
      create or replace function public."GetMyPlaceListsForPlaceV3"(
        p_google_place_id text
      )
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
      language sql
      security definer
      set search_path to 'public'
      as $fn$
        select
          list_row."UserPlaceListId",
          list_row."ListCode",
          list_row."Name",
          null::text as "Description",
          list_row."Icon",
          list_row."VisibilityCode",
          list_row."PlaceCount",
          list_row."IsSaved"
        from public."GetMyPlaceListsForPlaceV2"(p_google_place_id) as list_row;
      $fn$;
    $create$;

    execute $create$
      create or replace function public."GetMyPlaceListCoverOptions"(
        p_user_place_list_id bigint
      )
      returns table(
        "PlaceNotePhotoId" bigint,
        "PlaceNoteId" integer,
        "PlaceId" integer,
        "PlaceName" text,
        "NoteTitle" text,
        "StoragePath" text,
        "CreatedDate" timestamp with time zone
      )
      language sql
      security definer
      set search_path to 'public'
      as $fn$
        select
          null::bigint,
          null::integer,
          null::integer,
          null::text,
          null::text,
          null::text,
          null::timestamp with time zone
        where false;
      $fn$;
    $create$;

    execute $create$
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
      as $fn$
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
          raise exception 'Liste adı 1 ile 60 karakter arasında olmalı.';
        end if;

        if v_description is not null and char_length(v_description) > 180 then
          raise exception 'Liste açıklaması en fazla 180 karakter olabilir.';
        end if;

        if v_icon is not null and char_length(v_icon) > 12 then
          raise exception 'Liste simgesi geçersiz.';
        end if;

        if v_visibility_code not in ('PUBLIC', 'PRIVATE') then
          raise exception 'Liste görünürlüğü PUBLIC veya PRIVATE olmalıdır.';
        end if;

        v_user_id := public."GetMyActiveUserId"();

        if exists (
          select 1
          from public."UserPlaceLists" as existing_list
          where existing_list."UserId" = v_user_id
            and lower(existing_list."Name") = lower(v_name)
        ) then
          raise exception 'Bu isimde bir liste zaten var.';
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
          list_row."UserPlaceListId",
          list_row."ListCode",
          list_row."Name",
          list_row."Description",
          list_row."Icon",
          list_row."SortOrder",
          list_row."IsSystem",
          list_row."VisibilityCode",
          null::bigint as "CoverPlaceNotePhotoId",
          null::text as "CoverStoragePath",
          0::bigint as "PlaceCount"
        from public."UserPlaceLists" as list_row
        where list_row."UserPlaceListId" = v_list_id;
      end;
      $fn$;
    $create$;

    execute $create$
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
      as $fn$
      declare
        v_user_id integer;
        v_name text := btrim(coalesce(p_name, ''));
        v_description text := nullif(btrim(coalesce(p_description, '')), '');
        v_icon text := nullif(btrim(coalesce(p_icon, '')), '');
        v_visibility_code text := upper(btrim(coalesce(p_visibility_code, 'PRIVATE')));
      begin
        if p_user_place_list_id is null or p_user_place_list_id <= 0 then
          raise exception 'Geçerli bir liste seçmelisin.';
        end if;

        if char_length(v_name) < 1 or char_length(v_name) > 60 then
          raise exception 'Liste adı 1 ile 60 karakter arasında olmalı.';
        end if;

        if v_description is not null and char_length(v_description) > 180 then
          raise exception 'Liste açıklaması en fazla 180 karakter olabilir.';
        end if;

        if v_icon is not null and char_length(v_icon) > 12 then
          raise exception 'Liste simgesi geçersiz.';
        end if;

        if v_visibility_code not in ('PUBLIC', 'PRIVATE') then
          raise exception 'Liste görünürlüğü PUBLIC veya PRIVATE olmalıdır.';
        end if;

        v_user_id := public."GetMyActiveUserId"();

        if exists (
          select 1
          from public."UserPlaceLists" as other_list
          where other_list."UserId" = v_user_id
            and other_list."UserPlaceListId" <> p_user_place_list_id
            and lower(other_list."Name") = lower(v_name)
        ) then
          raise exception 'Bu isimde bir liste zaten var.';
        end if;

        update public."UserPlaceLists"
        set
          "Name" = v_name,
          "Description" = v_description,
          "Icon" = coalesce(v_icon, "Icon", '✦'),
          "VisibilityCode" = v_visibility_code,
          "UpdatedDate" = timezone('utc', now())
        where "UserPlaceListId" = p_user_place_list_id
          and "UserId" = v_user_id
          and "IsActive" = true;

        if not found then
          raise exception 'Liste bulunamadı veya bu listeyi güncelleme yetkin yok.';
        end if;

        return query
        select
          list_row."UserPlaceListId",
          list_row."ListCode",
          list_row."Name",
          list_row."Description",
          list_row."Icon",
          list_row."SortOrder",
          list_row."IsSystem",
          list_row."VisibilityCode",
          null::bigint as "CoverPlaceNotePhotoId",
          null::text as "CoverStoragePath",
          count(list_item."UserPlaceListItemId")::bigint as "PlaceCount"
        from public."UserPlaceLists" as list_row
        left join public."UserPlaceListItems" as list_item
          on list_item."UserPlaceListId" = list_row."UserPlaceListId"
        where list_row."UserPlaceListId" = p_user_place_list_id
          and list_row."UserId" = v_user_id
        group by
          list_row."UserPlaceListId",
          list_row."ListCode",
          list_row."Name",
          list_row."Description",
          list_row."Icon",
          list_row."SortOrder",
          list_row."IsSystem",
          list_row."VisibilityCode";
      end;
      $fn$;
    $create$;

    execute $create$
      create or replace function public."DeleteMyPlaceListV2"(
        p_user_place_list_id bigint
      )
      returns void
      language plpgsql
      security definer
      set search_path to 'public'
      as $fn$
      declare
        v_user_id integer;
      begin
        if p_user_place_list_id is null or p_user_place_list_id <= 0 then
          raise exception 'Geçerli bir liste seçmelisin.';
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
          raise exception 'Hazır listeler silinemez.';
        end if;

        delete from public."UserPlaceLists"
        where "UserPlaceListId" = p_user_place_list_id
          and "UserId" = v_user_id
          and "IsActive" = true
          and "IsSystem" = false;

        if not found then
          raise exception 'Liste bulunamadı veya bu listeyi silme yetkin yok.';
        end if;
      end;
      $fn$;
    $create$;
  end if;
end
$do$;

grant execute on function public."GetMyPlaceListsV3"() to authenticated;
grant execute on function public."GetVisibleUserPlaceListsV3"(integer) to authenticated;
grant execute on function public."GetMyPlaceListsForPlaceV3"(text) to authenticated;
grant execute on function public."GetMyPlaceListCoverOptions"(bigint) to authenticated;
grant execute on function public."CreateMyPlaceListV2"(text, text, text, text) to authenticated;
grant execute on function public."UpdateMyPlaceListV2"(bigint, text, text, text, text, bigint) to authenticated;
grant execute on function public."DeleteMyPlaceListV2"(bigint) to authenticated;

commit;
