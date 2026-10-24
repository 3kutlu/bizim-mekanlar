-- Remote Supabase migration history exportundan yeniden oluşturuldu.
-- Version: 20260703000001
-- Name: v2_1_1_2_note_photo_soft_delete
-- Bu dosyanın version/name değeri remote schema_migrations kaydıyla eşleşmelidir.

-- Statement 1/5
-- Bizim Mekanlar v2.1.1.2
-- Note photo deletion hotfix
--
-- Problem fixed:
-- Older functions directly deleted from storage.objects.
-- Supabase Storage blocks direct DELETE statements against storage tables.
--
-- New behaviour:
-- - Removing one photo sets PlaceNotePhotos.IsActive = false.
-- - Deleting a note sets the note inactive and the existing trigger soft-deletes
--   that note's photo metadata as well.
-- - Physical objects in the private `note-photos` bucket are intentionally kept.
--   They are no longer reachable through application queries or signed URLs.
--
-- No frontend change is required.

begin;

-- Statement 2/5
create or replace function public."CleanupPlaceNotePhotosOnDeactivate"()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if old."IsActive" = true and new."IsActive" = false then
    update public."PlaceNotePhotos" as photo
    set
      "IsActive" = false,
      "UpdatedDate" = now()
    where photo."PlaceNoteId" = new."PlaceNoteId"
      and photo."IsActive" = true;
  end if;

  return new;
end;
$function$;

-- Statement 3/5
create or replace function public."DeleteMyPlaceNotePhoto"(
  p_place_note_photo_id bigint
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id integer;
  v_photo_id bigint;
begin
  if p_place_note_photo_id is null or p_place_note_photo_id <= 0 then
    raise exception 'Geçerli bir fotoğraf seçmelisin.';
  end if;

  v_user_id := public."GetMyActiveUserId"();

  update public."PlaceNotePhotos" as photo
  set
    "IsActive" = false,
    "UpdatedDate" = now()
  from public."PlaceNotes" as own_note
  where photo."PlaceNotePhotoId" = p_place_note_photo_id
    and photo."UserId" = v_user_id
    and photo."IsActive" = true
    and own_note."PlaceNoteId" = photo."PlaceNoteId"
    and own_note."UserId" = v_user_id
    and own_note."IsActive" = true
  returning photo."PlaceNotePhotoId" into v_photo_id;

  if v_photo_id is null then
    raise exception 'Fotoğraf bulunamadı veya silme yetkin yok.';
  end if;
end;
$function$;

-- Statement 4/5
create or replace function public."DeleteMyPlaceNoteWithPhotosV2"(
  p_place_note_id integer
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if p_place_note_id is null or p_place_note_id <= 0 then
    raise exception 'Geçerli bir not seçmelisin.';
  end if;

  -- DeleteMyPlaceNote performs the ownership check and soft-deletes PlaceNotes.
  -- TR_PlaceNotes_CleanupPhotosOnDeactivate then soft-deletes related photos.
  perform public."DeleteMyPlaceNote"(p_place_note_id);
end;
$function$;

-- Statement 5/5
commit;
