-- Fix: unsaved places could not be prepared for in-app sharing because
-- the INSERT ... RETURNING clause conflicted with RETURNS TABLE output names.

create or replace function public."EnsurePlaceForContentShare"(
  p_place_id bigint default null,
  p_google_place_id text default null,
  p_name text default null,
  p_formatted_address text default null,
  p_postal_code text default null,
  p_city_name text default null,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_venue_category_code text default null
)
returns table(
  "PlaceId" bigint,
  "PublicId" uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id integer;
  v_place_id bigint;
  v_public_id uuid;
  v_city_id integer;
  v_google_place_id text := nullif(btrim(coalesce(p_google_place_id, '')), '');
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_formatted_address text := nullif(btrim(coalesce(p_formatted_address, '')), '');
  v_postal_code text := nullif(btrim(coalesce(p_postal_code, '')), '');
  v_city_name text := nullif(btrim(coalesce(p_city_name, '')), '');
  v_venue_category_code text := nullif(btrim(coalesce(p_venue_category_code, '')), '');
begin
  v_user_id := public."GetMyActiveUserId"();

  if p_place_id is not null and p_place_id > 0 then
    select
      place_row."PlaceId",
      place_row."PublicId"
    into
      v_place_id,
      v_public_id
    from public."Places" as place_row
    where place_row."PlaceId" = p_place_id
      and place_row."IsActive" = true
    limit 1;

    if v_place_id is not null then
      return query
      select v_place_id, v_public_id;
      return;
    end if;
  end if;

  if v_google_place_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'Application error',
      detail = 'APP_ERROR:PLACE_DATA_INCOMPLETE';
  end if;

  select
    place_row."PlaceId",
    place_row."PublicId"
  into
    v_place_id,
    v_public_id
  from public."Places" as place_row
  where place_row."GooglePlaceId" = v_google_place_id
  limit 1;

  if v_place_id is not null then
    update public."Places" as place_to_activate
    set
      "IsActive" = true,
      "UpdatedDate" = now(),
      "UpdatedBy" = v_user_id
    where place_to_activate."PlaceId" = v_place_id;

    return query
    select v_place_id, v_public_id;
    return;
  end if;

  if v_name is null
     or v_formatted_address is null
     or v_city_name is null
     or p_latitude is null
     or p_longitude is null then
    raise exception using
      errcode = 'P0001',
      message = 'Application error',
      detail = 'APP_ERROR:PLACE_DATA_INCOMPLETE';
  end if;

  select city_row."CityId"
  into v_city_id
  from public."Cities" as city_row
  where city_row."IsActive" = true
    and lower(btrim(city_row."Name")) = lower(v_city_name)
  order by city_row."CityId"
  limit 1;

  if v_city_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'Application error',
      detail = 'APP_ERROR:CITY_NOT_FOUND';
  end if;

  begin
    insert into public."Places" as inserted_place (
      "GooglePlaceId",
      "Name",
      "FormattedAddress",
      "PostalCode",
      "CityId",
      "Latitude",
      "Longitude",
      "VenueCategoryCode",
      "CreatedDate",
      "CreatedBy",
      "UpdatedDate",
      "UpdatedBy",
      "IsActive"
    )
    values (
      v_google_place_id,
      v_name,
      v_formatted_address,
      v_postal_code,
      v_city_id,
      p_latitude,
      p_longitude,
      v_venue_category_code,
      now(),
      v_user_id,
      now(),
      v_user_id,
      true
    )
    returning
      inserted_place."PlaceId",
      inserted_place."PublicId"
    into
      v_place_id,
      v_public_id;
  exception
    when unique_violation then
      select
        place_row."PlaceId",
        place_row."PublicId"
      into
        v_place_id,
        v_public_id
      from public."Places" as place_row
      where place_row."GooglePlaceId" = v_google_place_id
      limit 1;
  end;

  if v_place_id is null or v_public_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'Application error',
      detail = 'APP_ERROR:PLACE_CREATE_FAILED';
  end if;

  return query
  select v_place_id, v_public_id;
end;
$$;

revoke all on function public."EnsurePlaceForContentShare"(
  bigint,
  text,
  text,
  text,
  text,
  text,
  double precision,
  double precision,
  text
) from public;

grant execute on function public."EnsurePlaceForContentShare"(
  bigint,
  text,
  text,
  text,
  text,
  text,
  double precision,
  double precision,
  text
) to authenticated;
