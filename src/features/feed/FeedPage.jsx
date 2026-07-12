/*
 * Refactored from the application root.
 * This feature module intentionally keeps existing UI behavior intact.
 */

import { MESSAGE_KEY } from "../../i18n/messages.js";
import { supabase } from "../../supabase.js";
import { getVenueCategoryIcon, getVenueCategoryLabel } from "../../utils/venueCategory.js";
import { EmptyCollectionState, ErrorState, LoadingState, NoteFeed } from "../notes/NoteComponents.jsx";
import { useCallback, useEffect, useState } from "react";
import { filterUnavailableUsers, getMyUnavailableUserIds } from "../../utils/userRelationships.js";

export function ListPage({
  refreshKey,
  placeReviewFilter,
  onClearPlaceReviewFilter,
  currentUserId,
  onOpenPlace,
  onOpenUser,
  onOpenNote,
}) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const isPlaceReviewMode = Boolean(placeReviewFilter?.placeId);
  const venueIcon = getVenueCategoryIcon(placeReviewFilter?.venueCategoryCode);

  const loadNotes = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");

    const request = isPlaceReviewMode
      ? supabase.rpc("GetPlaceVisibleNoteCards", {
          p_place_id: Number(placeReviewFilter.placeId),
        })
      : supabase.rpc("GetFollowingFeedNoteCardsV2");

    const { data, error } = await request;

    if (error) {
      console.error(
        isPlaceReviewMode
          ? "Mekan yorumları alınamadı:"
          : "Akış notları alınamadı:",
        error
      );
      setNotes([]);
      setErrorMessage(
        isPlaceReviewMode
          ? MESSAGE_KEY.PLACE_REVIEWS_LOAD_FAILED
          : MESSAGE_KEY.FEED_LOAD_FAILED
      );
    } else {
      try {
        const unavailableUserIds = await getMyUnavailableUserIds();
        setNotes(
          filterUnavailableUsers(data ?? [], unavailableUserIds, ["UserId"])
        );
      } catch (relationshipError) {
        console.error("Akış ilişki filtresi uygulanamadı:", relationshipError);
        setNotes(data ?? []);
      }
    }

    setLoading(false);
  }, [isPlaceReviewMode, placeReviewFilter?.placeId]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes, refreshKey, placeReviewFilter?.requestId]);

  const headingTitle = isPlaceReviewMode
    ? `${placeReviewFilter.placeName} yorumları`
    : "Takip ettiklerin";
  const headingDescription = isPlaceReviewMode
    ? "Kendi notların, herkese açık hesaplar ve seni kabul eden gizli hesapların yorumları burada."
    : "Senin ve takip ettiğin kişilerin en yeni notları burada.";

  return (
    <section className="list-page page-section">
      <div className="page-heading list-page-heading">
        {isPlaceReviewMode && <p className="eyebrow">MEKAN YORUMLARI</p>}
        <h1 className={isPlaceReviewMode ? "place-review-list-title" : undefined}>
          {isPlaceReviewMode && (
            <span
              className="venue-category-icon venue-category-icon-page-title"
              title={getVenueCategoryLabel(placeReviewFilter?.venueCategoryCode)}
              aria-hidden="true"
            >
              {venueIcon}
            </span>
          )}
          {headingTitle}
        </h1>
        <p>{headingDescription}</p>

        {!isPlaceReviewMode && (
          <p className="list-page-feedback-note">
            Bizim Mekanlar henüz gelişmeye devam ediyor. Her türlü hata, öneri ya da fikir için{" "}
            <a href="mailto:3kutlu@gmail.com?subject=Bizim%20Mekanlar%20Geri%20Bildirim">
              bizimle iletişime geçebilirsiniz.
            </a>
          </p>
        )}

        {isPlaceReviewMode && (
          <button
            className="place-review-reset-button"
            type="button"
            onClick={onClearPlaceReviewFilter}
          >
            Takip ettiklerin akışına dön
          </button>
        )}
      </div>

      {loading && <LoadingState />}

      {!loading && errorMessage && (
        <ErrorState message={errorMessage} onRetry={loadNotes} />
      )}

      {!loading && !errorMessage && notes.length === 0 && (
        <EmptyCollectionState
          icon="star"
          title={
            isPlaceReviewMode
              ? "Bu mekanda sana görünür yorum yok"
              : "Akış sessiz görünüyor"
          }
          message={
            isPlaceReviewMode
              ? "Bu mekan için ilk görünür notu sen ekleyebilir veya takip ettiğin kişilerin yorumlarını burada görebilirsin."
              : "Sen not ekledikçe ve takip ettiğin kişiler mekan deneyimlerini paylaştıkça burası canlanacak."
          }
        />
      )}

      {!loading && !errorMessage && notes.length > 0 && (
        <NoteFeed
          notes={notes}
          currentUserId={currentUserId}
          onOpenPlace={onOpenPlace}
          onOpenUser={onOpenUser}
          onOpenNote={onOpenNote}
        />
      )}
    </section>
  );
}
