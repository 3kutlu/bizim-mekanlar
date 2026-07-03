/*
 * Refactored from the application root.
 * This feature module intentionally keeps existing UI behavior intact.
 */

import ShareIconButton from "../../components/ShareIconButton.jsx";
import { MESSAGE_KEY, getErrorMessageKey } from "../../i18n/messages.js";
import { supabase } from "../../supabase.js";
import { createSignedNotePhotoUrls } from "../../utils/notePhotos.js";
import { getVenueCategoryIcon, getVenueCategoryLabel } from "../../utils/venueCategory.js";
import { ErrorState, LoadingState, NoteFeed } from "../notes/NoteComponents.jsx";
import { useCallback, useEffect, useMemo, useState } from "react";

export function PlaceDetailPage({
  placeId,
  placeName,
  venueCategoryCode,
  isActive,
  currentUserId,
  onBack,
  onOpenPlaceOnMap,
  onOpenUser,
  onOpenNote,
  onShare,
}) {
  const [place, setPlace] = useState(null);
  const [notes, setNotes] = useState([]);
  const [placePhotos, setPlacePhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notesLoading, setNotesLoading] = useState(true);
  const [photosLoading, setPhotosLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [notesError, setNotesError] = useState("");
  const [photosError, setPhotosError] = useState("");
  const [sortBy, setSortBy] = useState("newest");

  const normalizedPlaceId = Number(placeId);

  const loadPlace = useCallback(async () => {
    if (!Number.isInteger(normalizedPlaceId) || normalizedPlaceId <= 0) {
      setPlace(null);
      setNotes([]);
      setPlacePhotos([]);
      setLoading(false);
      setNotesLoading(false);
      setPhotosLoading(false);
      setErrorMessage("Mekan bilgisi bulunamadı.");
      return;
    }

    setLoading(true);
    setNotesLoading(true);
    setPhotosLoading(true);
    setErrorMessage("");
    setNotesError("");
    setPhotosError("");

    const [placeResult, notesResult, photosResult] = await Promise.all([
      supabase.rpc("GetPlaceMapTargetV2", {
        p_place_id: normalizedPlaceId,
      }),
      supabase.rpc("GetPlaceVisibleNoteCards", {
        p_place_id: normalizedPlaceId,
      }),
      supabase.rpc("GetPlaceVisibleNotePhotos", {
        p_place_id: normalizedPlaceId,
        p_limit: 120,
      }),
    ]);

    if (placeResult.error) {
      console.error("Mekan detayı alınamadı:", placeResult.error);
      setPlace(null);
      setNotes([]);
      setPlacePhotos([]);
      setErrorMessage(
        getErrorMessageKey(placeResult.error, MESSAGE_KEY.PLACE_TARGET_LOAD_FAILED)
      );
      setLoading(false);
      setNotesLoading(false);
      setPhotosLoading(false);
      return;
    }

    const placeData = Array.isArray(placeResult.data)
      ? placeResult.data[0]
      : placeResult.data;

    if (!placeData) {
      setPlace(null);
      setNotes([]);
      setPlacePhotos([]);
      setErrorMessage("Mekan bulunamadı veya artık aktif değil.");
      setLoading(false);
      setNotesLoading(false);
      setPhotosLoading(false);
      return;
    }

    setPlace(placeData);
    setLoading(false);

    if (notesResult.error) {
      console.error("Mekan yorumları alınamadı:", notesResult.error);
      setNotes([]);
      setNotesError(
        getErrorMessageKey(notesResult.error, MESSAGE_KEY.PLACE_REVIEWS_LOAD_FAILED)
      );
    } else {
      setNotes(notesResult.data ?? []);
    }

    setNotesLoading(false);

    if (photosResult.error) {
      console.error("Mekan fotoğrafları alınamadı:", photosResult.error);
      setPlacePhotos([]);
      setPhotosError("Mekan fotoğrafları şu an yüklenemedi. Tekrar dene.");
    } else {
      try {
        const signedPhotos = await createSignedNotePhotoUrls(photosResult.data ?? []);
        setPlacePhotos(signedPhotos);
      } catch (error) {
        console.error("Mekan fotoğraf bağlantıları oluşturulamadı:", error);
        setPlacePhotos([]);
        setPhotosError("Mekan fotoğrafları şu an görüntülenemedi. Tekrar dene.");
      }
    }

    setPhotosLoading(false);
  }, [normalizedPlaceId]);

  useEffect(() => {
    void loadPlace();
  }, [loadPlace]);

  useEffect(() => {
    if (!isActive) {
      return undefined;
    }

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        onBack();
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isActive, onBack]);

  const sortedNotes = useMemo(() => {
    const copy = [...notes];

    return copy.sort((left, right) => {
      if (sortBy === "highest") {
        return Number(right?.Rating ?? 0) - Number(left?.Rating ?? 0);
      }

      if (sortBy === "lowest") {
        return Number(left?.Rating ?? 6) - Number(right?.Rating ?? 6);
      }

      return (
        new Date(right?.CreatedDate ?? 0).getTime() -
        new Date(left?.CreatedDate ?? 0).getTime()
      );
    });
  }, [notes, sortBy]);

  const ratings = notes
    .map((note) => Number(note?.Rating))
    .filter((rating) => Number.isInteger(rating) && rating >= 1 && rating <= 5);
  const averageRating =
    ratings.length > 0
      ? ratings.reduce((total, rating) => total + rating, 0) / ratings.length
      : null;
  const resolvedName =
    String(place?.Name ?? placeName ?? "").trim() || "Mekan";
  const resolvedCategoryCode =
    place?.VenueCategoryCode ?? venueCategoryCode ?? null;
  const resolvedCategoryLabel = getVenueCategoryLabel(resolvedCategoryCode);
  const resolvedCategoryIcon = getVenueCategoryIcon(resolvedCategoryCode);
  const hasMapCoordinates =
    Number.isFinite(Number(place?.Latitude)) &&
    Number.isFinite(Number(place?.Longitude));
  const visiblePhotoCount = Number(
    placePhotos[0]?.VisiblePhotoCount ?? placePhotos.length
  );
  const safePhotoCount = Number.isFinite(visiblePhotoCount)
    ? visiblePhotoCount
    : placePhotos.length;

  return (
    <div className="discovery-page-content place-detail-page">
      <header className="discovery-page-header discovery-page-header-no-back place-detail-page-header">
        <div className="place-detail-header-actions">
          <span className="place-detail-header-label">MEKAN</span>
          <ShareIconButton
            className="place-detail-share-button"
            onClick={onShare}
            disabled={!onShare}
            label="Mekanı paylaş"
          />
        </div>
      </header>

      <div className="discovery-page-body place-detail-page-body">
        {loading && <LoadingState compact />}

        {!loading && errorMessage && (
          <ErrorState message={errorMessage} onRetry={loadPlace} compact />
        )}

        {!loading && !errorMessage && place && (
          <>
            <section className="place-detail-hero">
              <div className="place-detail-category" title={resolvedCategoryLabel}>
                <span aria-hidden="true">{resolvedCategoryIcon}</span>
                {resolvedCategoryLabel}
              </div>

              <h1>{resolvedName}</h1>

              {place.FormattedAddress && (
                <p className="place-detail-address">{place.FormattedAddress}</p>
              )}

              <div className="place-detail-stat-row" aria-label="Mekan puanı, yorum ve fotoğraf sayısı">
                <div>
                  <strong>
                    {averageRating ? `${averageRating.toFixed(1)} / 5` : "Puan yok"}
                  </strong>
                  <span>{ratings.length > 0 ? `${ratings.length} puan` : "Henüz puanlanmadı"}</span>
                </div>
                <div>
                  <strong>{notes.length}</strong>
                  <span>yorum</span>
                </div>
                <div>
                  <strong>{photosLoading ? "…" : safePhotoCount}</strong>
                  <span>fotoğraf</span>
                </div>
              </div>

              <div className="place-detail-actions">
                <button
                  className="place-detail-map-button"
                  type="button"
                  onClick={() => onOpenPlaceOnMap?.(normalizedPlaceId)}
                  disabled={!hasMapCoordinates || !onOpenPlaceOnMap}
                >
                  Haritada aç
                </button>
                <button
                  className="place-detail-save-button"
                  type="button"
                  onClick={() => onOpenPlaceOnMap?.(normalizedPlaceId, "save")}
                  disabled={!onOpenPlaceOnMap}
                >
                  Kaydet
                </button>
              </div>

              <button
                className="place-detail-add-note-button"
                type="button"
                onClick={() => onOpenPlaceOnMap?.(normalizedPlaceId, "note")}
                disabled={!onOpenPlaceOnMap}
              >
                Bu mekana not ekle
              </button>
            </section>

            <PlacePhotoGallery
              photos={placePhotos}
              loading={photosLoading}
              errorMessage={photosError}
              onRetry={loadPlace}
              onOpenNote={onOpenNote}
            />

            <section className="place-detail-reviews" aria-label="Mekan yorumları">
              <div className="place-detail-reviews-heading">
                <div>
                  <p className="eyebrow">YORUMLAR</p>
                  <h2>Bu mekan hakkında</h2>
                </div>

                <div className="place-detail-sort" role="group" aria-label="Yorumları sırala">
                  <button
                    type="button"
                    className={sortBy === "newest" ? "place-detail-sort-active" : ""}
                    onClick={() => setSortBy("newest")}
                  >
                    Yeni
                  </button>
                  <button
                    type="button"
                    className={sortBy === "highest" ? "place-detail-sort-active" : ""}
                    onClick={() => setSortBy("highest")}
                  >
                    Yüksek
                  </button>
                  <button
                    type="button"
                    className={sortBy === "lowest" ? "place-detail-sort-active" : ""}
                    onClick={() => setSortBy("lowest")}
                  >
                    Düşük
                  </button>
                </div>
              </div>

              {notesLoading && <LoadingState compact />}

              {!notesLoading && notesError && (
                <ErrorState message={notesError} onRetry={loadPlace} compact />
              )}

              {!notesLoading && !notesError && sortedNotes.length === 0 && (
                <div className="place-detail-empty-reviews">
                  <span aria-hidden="true">✦</span>
                  <h3>Henüz yorum yok</h3>
                  <p>Bu mekanla ilgili ilk notu sen ekleyebilirsin.</p>
                </div>
              )}

              {!notesLoading && !notesError && sortedNotes.length > 0 && (
                <NoteFeed
                  notes={sortedNotes}
                  currentUserId={currentUserId}
                  onOpenPlace={onOpenPlaceOnMap}
                  onOpenUser={onOpenUser}
                  onOpenNote={onOpenNote}
                  placeLinkTitle="Mekanı haritada aç"
                />
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

export function PlacePhotoGallery({ photos, loading, errorMessage, onRetry, onOpenNote }) {
  if (loading) {
    return (
      <section className="place-detail-photo-section" aria-busy="true">
        <div className="place-detail-photo-heading">
          <div>
            <p className="eyebrow">FOTOĞRAFLAR</p>
            <h2>Mekandan kareler</h2>
          </div>
        </div>
        <p className="place-detail-photo-state">Fotoğraflar yükleniyor...</p>
      </section>
    );
  }

  if (errorMessage) {
    return (
      <section className="place-detail-photo-section">
        <div className="place-detail-photo-heading">
          <div>
            <p className="eyebrow">FOTOĞRAFLAR</p>
            <h2>Mekandan kareler</h2>
          </div>
        </div>
        <div className="place-detail-photo-error">
          <p>{errorMessage}</p>
          <button type="button" onClick={onRetry}>Tekrar dene</button>
        </div>
      </section>
    );
  }

  if (photos.length === 0) {
    return null;
  }

  return (
    <section className="place-detail-photo-section" aria-label="Mekan fotoğrafları">
      <div className="place-detail-photo-heading">
        <div>
          <p className="eyebrow">FOTOĞRAFLAR</p>
          <h2>Mekandan kareler</h2>
        </div>
        <span>{Number(photos[0]?.VisiblePhotoCount ?? photos.length)}</span>
      </div>

      <div className="place-detail-photo-grid">
        {photos.map((photo) => {
          const author = String(photo?.Username ?? "").trim();
          const title = String(photo?.NoteTitle ?? "").trim();
          const label = author ? `@${author}` : title || "Notu aç";

          return (
            <button
              className="place-detail-photo-tile"
              type="button"
              key={photo.PlaceNotePhotoId}
              onClick={() => onOpenNote?.(Number(photo.PlaceNoteId))}
              disabled={!photo.SignedUrl || !photo.PlaceNoteId || !onOpenNote}
              title={author ? `${label} notunu aç` : "Not detayını aç"}
            >
              <img
                src={photo.SignedUrl}
                alt={author ? `${author} kullanıcısının mekan fotoğrafı` : "Mekan fotoğrafı"}
              />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
