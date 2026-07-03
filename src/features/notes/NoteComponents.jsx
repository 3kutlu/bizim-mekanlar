/*
 * Refactored from the application root.
 * This feature module intentionally keeps existing UI behavior intact.
 */

import { MESSAGE_KEY, getErrorMessageKey, t } from "../../i18n/messages.js";
import { supabase } from "../../supabase.js";
import { MAX_NOTE_PHOTOS, createNotePhotoDrafts, createSignedNotePhotoUrls, getPhotoSelectionError, revokeNotePhotoDrafts, uploadMyNotePhotoDrafts } from "../../utils/notePhotos.js";
import { useProfilePhotoUrls } from "../../utils/profilePhotos.js";
import { getIstanbulDateInputValue } from "../../utils/dates.js";
import { getVenueCategoryIcon, getVenueCategoryLabel } from "../../utils/venueCategory.js";
import { EMPTY_NOTE_REACTION_SUMMARY, NoteReactionControls, ReadOnlyRatingStars, formatDate, formatNoteRating, formatRelativeNoteTime, getFullName, getNoteTitle, getReactionNoteId, getReactionSummaryRows, isPrivateAccount, normalizeReactionSummary, toDateInputValue } from "../app/appShared.jsx";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function NoteFeed({
  notes,
  compact = false,
  variant = "feed",
  currentUserId,
  onOpenPlace,
  onOpenUser,
  onOpenNote,
  placeLinkTitle = "Mekan sayfasını aç",
}) {
  const [reactionSummaries, setReactionSummaries] = useState({});
  const [reactionSummariesLoading, setReactionSummariesLoading] = useState(false);
  const noteUserIds = useMemo(
    () => notes.map((note) => note?.UserId),
    [notes]
  );
  const profilePhotoUrls = useProfilePhotoUrls(noteUserIds);

  const isProfileVariant = variant === "profile";
  const shouldShowReactions = !isProfileVariant;

  const noteIds = useMemo(
    () => {
      if (!shouldShowReactions) {
        return [];
      }

      return [...new Set(
        notes
          .map(getReactionNoteId)
          .filter(Boolean)
      )];
    },
    [notes, shouldShowReactions]
  );
  const noteIdsKey = noteIds.join(",");

  useEffect(() => {
    let isCurrent = true;

    if (noteIds.length === 0) {
      setReactionSummaries({});
      setReactionSummariesLoading(false);
      return undefined;
    }

    setReactionSummariesLoading(true);

    const loadReactionSummaries = async () => {
      const { data, error } = await supabase.rpc(
        "GetPlaceNoteReactionSummaries",
        {
          p_place_note_ids: noteIds,
        }
      );

      if (!isCurrent) {
        return;
      }

      if (error) {
        console.error("Not reaksiyon özetleri alınamadı:", error);
        setReactionSummaries({});
        setReactionSummariesLoading(false);
        return;
      }

      const nextSummaries = {};

      for (const row of getReactionSummaryRows(data)) {
        const noteId = getReactionNoteId(row);

        if (noteId) {
          nextSummaries[noteId] = normalizeReactionSummary(row);
        }
      }

      setReactionSummaries(nextSummaries);
      setReactionSummariesLoading(false);
    };

    void loadReactionSummaries();

    return () => {
      isCurrent = false;
    };
  }, [noteIds, noteIdsKey]);

  const handleReactionSummaryChange = useCallback((noteId, summary) => {
    setReactionSummaries((current) => ({
      ...current,
      [noteId]: normalizeReactionSummary(summary),
    }));
  }, []);

  return (
    <div
      className={`note-feed${
        compact ? " note-feed-compact" : ""
      }${isProfileVariant ? " note-feed-profile" : ""}`}
      aria-busy={shouldShowReactions && reactionSummariesLoading}
    >
      {notes.map((note, index) => {
        const username = note.Username || "Kullanıcı";
        const profilePhotoUrl = profilePhotoUrls[Number(note?.UserId)] || "";
        const title = getNoteTitle(note);
        const noteId = getReactionNoteId(note);
        const canOpenNote = Boolean(noteId && onOpenNote);

        const openNote = () => {
          if (canOpenNote) {
            onOpenNote(noteId);
          }
        };

        const handleCardKeyDown = (event) => {
          if (
            !canOpenNote ||
            event.target !== event.currentTarget ||
            (event.key !== "Enter" && event.key !== " ")
          ) {
            return;
          }

          event.preventDefault();
          openNote();
        };

        return (
          <article
            className={`note-feed-card${
              canOpenNote ? " note-feed-card-clickable" : ""
            }${isProfileVariant ? " note-feed-card-profile" : ""}`}
            key={
              noteId ??
              `note-${note.UserId ?? "unknown"}-${note.CreatedDate ?? "undated"}-${index}`
            }
            onClick={openNote}
            onKeyDown={handleCardKeyDown}
            tabIndex={canOpenNote ? 0 : undefined}
            aria-label={canOpenNote ? `${title} not detayını aç` : undefined}
          >
            {!isProfileVariant && (
              note.UserId && onOpenUser ? (
                <button
                  className="note-feed-avatar note-feed-avatar-button"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenUser(note.UserId);
                  }}
                  title={`${username} profilini aç`}
                  aria-label={`${username} profilini aç`}
                >
                  {profilePhotoUrl ? (
                    <img src={profilePhotoUrl} alt="" />
                  ) : (
                    username.charAt(0).toUpperCase()
                  )}
                </button>
              ) : (
                <div className="note-feed-avatar" aria-hidden="true">
                  {profilePhotoUrl ? (
                    <img src={profilePhotoUrl} alt="" />
                  ) : (
                    username.charAt(0).toUpperCase()
                  )}
                </div>
              )
            )}

            <div className="note-feed-content">
              <div className="note-feed-header">
                <div className="note-feed-meta">
                  {isProfileVariant ? (
                    <button
                      className="note-feed-place-link"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpenPlace?.({
                          placeId: note.PlaceId,
                          placeName: note.PlaceName,
                          venueCategoryCode: note.VenueCategoryCode,
                        });
                      }}
                      disabled={!note.PlaceId}
                      title={placeLinkTitle}
                    >
                      <span
                        className="venue-category-icon venue-category-icon-feed"
                        title={getVenueCategoryLabel(note.VenueCategoryCode)}
                        aria-hidden="true"
                      >
                        {getVenueCategoryIcon(note.VenueCategoryCode)}
                      </span>
                      {note.PlaceName}
                    </button>
                  ) : (
                    <>
                      {note.UserId && onOpenUser ? (
                        <button
                          className="note-feed-user-link"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onOpenUser(note.UserId);
                          }}
                          title="Kullanıcı profilini aç"
                        >
                          {username}
                          {isPrivateAccount(note.AccountVisibilityCode) ? " 🔒" : ""}
                        </button>
                      ) : (
                        <strong>
                          {username}
                          {isPrivateAccount(note.AccountVisibilityCode) ? " 🔒" : ""}
                        </strong>
                      )}

                      <span
                        className="note-feed-place-separator"
                        aria-hidden="true"
                      >
                        -
                      </span>

                      <button
                        className="note-feed-place-link"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpenPlace?.({
                          placeId: note.PlaceId,
                          placeName: note.PlaceName,
                          venueCategoryCode: note.VenueCategoryCode,
                        });
                        }}
                        disabled={!note.PlaceId}
                        title={placeLinkTitle}
                      >
                        <span
                          className="venue-category-icon venue-category-icon-feed"
                          title={getVenueCategoryLabel(note.VenueCategoryCode)}
                          aria-hidden="true"
                        >
                          {getVenueCategoryIcon(note.VenueCategoryCode)}
                        </span>
                        {note.PlaceName}
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="note-feed-summary-button">
                <strong>{title}</strong>
                <span>{formatNoteRating(note.Rating)}</span>
              </div>

              {shouldShowReactions && (
                <NoteReactionControls
                  noteId={noteId}
                  noteOwnerUserId={note.UserId}
                  currentUserId={currentUserId}
                  summary={
                    noteId
                      ? reactionSummaries[noteId] ?? EMPTY_NOTE_REACTION_SUMMARY
                      : EMPTY_NOTE_REACTION_SUMMARY
                  }
                  onSummaryChange={handleReactionSummaryChange}
                  variant="feed"
                />
              )}

              <time
                className="note-feed-created-time"
                dateTime={note.CreatedDate}
                title={formatDate(note.CreatedDate, {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              >
                {formatRelativeNoteTime(note.CreatedDate)}
              </time>
            </div>
          </article>
        );
      })}
    </div>
  );
}

export function NoteDetailPage({
  noteId,
  isActive,
  currentUserId,
  onBack,
  onOpenPlace,
  onOpenUser,
  onNoteDeleted,
  onNoteUpdated,
}) {
  const [note, setNote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [reactionSummary, setReactionSummary] = useState(
    EMPTY_NOTE_REACTION_SUMMARY
  );
  const [reactionSummaryLoading, setReactionSummaryLoading] = useState(false);
  const [notePhotos, setNotePhotos] = useState([]);
  const [photosLoading, setPhotosLoading] = useState(true);
  const [photosError, setPhotosError] = useState("");
  const actionMenuRef = useRef(null);
  const noteProfilePhotoUrls = useProfilePhotoUrls([note?.UserId]);

  const loadNote = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    setReactionSummary(EMPTY_NOTE_REACTION_SUMMARY);
    setReactionSummaryLoading(true);

    const { data, error } = await supabase.rpc("GetPlaceNoteDetailV2", {
      p_place_note_id: noteId,
    });

    if (error) {
      console.error("Not detayı alınamadı:", error);
      setNote(null);
      setErrorMessage(
        getErrorMessageKey(error, MESSAGE_KEY.NOTE_LOAD_FAILED)
      );
      setReactionSummaryLoading(false);
      setLoading(false);
      return;
    }

    const detail = Array.isArray(data) ? data[0] : data;

    if (!detail) {
      setNote(null);
      setErrorMessage(MESSAGE_KEY.NOTE_NOT_FOUND_OR_RESTRICTED);
      setReactionSummaryLoading(false);
      setLoading(false);
      return;
    }

    setNote(detail);
    setLoading(false);

    const { data: reactionData, error: reactionError } = await supabase.rpc(
      "GetPlaceNoteReactionSummary",
      {
        p_place_note_id: Number(detail.PlaceNoteId),
      }
    );

    if (reactionError) {
      console.error("Not reaksiyon özeti alınamadı:", reactionError);
    } else {
      setReactionSummary(
        normalizeReactionSummary(
          Array.isArray(reactionData) ? reactionData[0] : reactionData
        )
      );
    }

    setReactionSummaryLoading(false);
  }, [noteId]);

  const loadNotePhotos = useCallback(async () => {
    if (!Number.isInteger(Number(noteId)) || Number(noteId) <= 0) {
      setNotePhotos([]);
      setPhotosError("");
      setPhotosLoading(false);
      return;
    }

    setPhotosLoading(true);
    setPhotosError("");

    const { data, error } = await supabase.rpc("GetVisiblePlaceNotePhotos", {
      p_place_note_id: Number(noteId),
    });

    if (error) {
      console.error("Not fotoğrafları alınamadı:", error);
      setNotePhotos([]);
      setPhotosError("Fotoğraflar şu an yüklenemedi. Tekrar dene.");
      setPhotosLoading(false);
      return;
    }

    try {
      setNotePhotos(await createSignedNotePhotoUrls(data ?? []));
    } catch (signedUrlError) {
      console.error("Not fotoğraf bağlantıları oluşturulamadı:", signedUrlError);
      setNotePhotos([]);
      setPhotosError("Fotoğraflar şu an görüntülenemedi. Tekrar dene.");
    }

    setPhotosLoading(false);
  }, [noteId]);

  useEffect(() => {
    void loadNote();
    void loadNotePhotos();
  }, [loadNote, loadNotePhotos]);

  useEffect(() => {
    if (!isActionMenuOpen) {
      return undefined;
    }

    const closeOnOutsidePointer = (event) => {
      if (!actionMenuRef.current?.contains(event.target)) {
        setIsActionMenuOpen(false);
      }
    };

    window.addEventListener("pointerdown", closeOnOutsidePointer);

    return () => window.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [isActionMenuOpen]);

  useEffect(() => {
    if (!isActive) {
      return undefined;
    }

    const handleEscape = (event) => {
      if (event.key !== "Escape") {
        return;
      }

      if (isEditModalOpen) {
        return;
      }

      if (isDeleteModalOpen) {
        if (!isDeleting) {
          setIsDeleteModalOpen(false);
          setDeleteError("");
        }
        return;
      }

      if (isActionMenuOpen) {
        setIsActionMenuOpen(false);
        return;
      }

      onBack();
    };

    window.addEventListener("keydown", handleEscape);

    return () => window.removeEventListener("keydown", handleEscape);
  }, [
    isActionMenuOpen,
    isActive,
    isDeleteModalOpen,
    isDeleting,
    isEditModalOpen,
    onBack,
  ]);

  const username = note?.Username || "Kullanıcı";
  const fullName = getFullName(note);
  const avatarLetter = (username || fullName || "K").charAt(0).toUpperCase();
  const noteProfilePhotoUrl = noteProfilePhotoUrls[Number(note?.UserId)] || "";
  const isOwnNote =
    Number.isInteger(Number(note?.UserId)) &&
    Number.isInteger(Number(currentUserId)) &&
    Number(note.UserId) === Number(currentUserId);

  const openEditModal = () => {
    if (!note || !isOwnNote || isSavingEdit) {
      return;
    }

    setIsActionMenuOpen(false);
    setEditError("");
    setIsEditModalOpen(true);
  };

  const closeEditModal = () => {
    if (isSavingEdit) {
      return;
    }

    setIsEditModalOpen(false);
    setEditError("");
  };

  const handleEditedPhotosChanged = async () => {
    await loadNotePhotos();
    await Promise.resolve(onNoteUpdated?.());
  };

  const completeEditModal = () => {
    setIsEditModalOpen(false);
    setEditError("");
  };

  const handleEditSave = async (nextValues) => {
    if (!note?.PlaceNoteId || !isOwnNote || isSavingEdit) {
      return false;
    }

    setIsSavingEdit(true);
    setEditError("");

    try {
      const { error } = await supabase.rpc("UpdateMyPlaceNote", {
        p_place_note_id: Number(note.PlaceNoteId),
        p_title: nextValues.title,
        p_rating: Number(nextValues.rating),
        p_content: nextValues.content,
        p_visited_date: nextValues.visitedDate || null,
      });

      if (error) {
        console.error("Not güncellenemedi:", error);
        setEditError(error.message || "Not güncellenemedi. Lütfen tekrar dene.");
        return false;
      }

      await loadNote();
      await Promise.resolve(onNoteUpdated?.());
      return true;
    } catch (error) {
      console.error("Not güncellenirken beklenmeyen hata oluştu:", error);
      setEditError(error?.message || "Not güncellenemedi. Lütfen tekrar dene.");
      return false;
    } finally {
      setIsSavingEdit(false);
    }
  };

  const closeDeleteModal = () => {
    if (isDeleting) {
      return;
    }

    setIsDeleteModalOpen(false);
    setDeleteError("");
  };

  const openDeleteModal = () => {
    if (!isOwnNote || isDeleting) {
      return;
    }

    setIsActionMenuOpen(false);
    setDeleteError("");
    setIsDeleteModalOpen(true);
  };

  const handleDelete = async () => {
    if (!note?.PlaceNoteId || !isOwnNote || isDeleting) {
      return;
    }

    setIsDeleting(true);
    setDeleteError("");

    const { error } = await supabase.rpc("DeleteMyPlaceNoteWithPhotosV2", {
      p_place_note_id: Number(note.PlaceNoteId),
    });

    if (error) {
      console.error("Not silinemedi:", error);
      setDeleteError(
        getErrorMessageKey(error, MESSAGE_KEY.NOTE_DELETE_FAILED)
      );
      setIsDeleting(false);
      return;
    }

    await Promise.resolve(onNoteDeleted?.());
    setIsDeleteModalOpen(false);
    setIsDeleting(false);
    onBack();
  };

  return (
    <div className="discovery-page-content note-detail-page">
      <header className="discovery-page-header note-detail-page-header">
        <button
          className="discovery-back-button"
          type="button"
          onClick={onBack}
          aria-label="Geri dön"
        >
          ‹
          <span>Geri</span>
        </button>

        {note && (
          <div className="note-detail-header-actions">
            <button
              className="note-detail-page-author"
              type="button"
              onClick={() => onOpenUser?.(note.UserId)}
              disabled={!note.UserId || !onOpenUser}
              title="Kullanıcı profilini aç"
            >
              <span className="note-detail-avatar" aria-hidden="true">
                {noteProfilePhotoUrl ? (
                  <img src={noteProfilePhotoUrl} alt="" />
                ) : (
                  avatarLetter
                )}
              </span>
              <span className="note-detail-page-author-copy">
                <strong>{fullName || username}</strong>
                <small>
                  @{username}
                  {isPrivateAccount(note?.AccountVisibilityCode) ? " 🔒" : ""}
                </small>
              </span>
            </button>

            {isOwnNote && (
              <div className="note-detail-more-menu" ref={actionMenuRef}>
                <button
                  className="note-detail-more-button"
                  type="button"
                  onClick={() => setIsActionMenuOpen((current) => !current)}
                  aria-label="Not işlemleri"
                  aria-expanded={isActionMenuOpen}
                  aria-haspopup="menu"
                  title="Not işlemleri"
                >
                  <span aria-hidden="true">•••</span>
                </button>

                {isActionMenuOpen && (
                  <div className="note-detail-more-popover" role="menu">
                    <button type="button" role="menuitem" onClick={openEditModal}>
                      Notu düzenle
                    </button>
                    <button
                      className="note-detail-more-action-danger"
                      type="button"
                      role="menuitem"
                      onClick={openDeleteModal}
                    >
                      Notu sil
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </header>

      <div className="discovery-page-body">
        {loading && <LoadingState compact />}

        {!loading && errorMessage && (
          <ErrorState message={errorMessage} onRetry={loadNote} compact />
        )}

        {!loading && note && (
          <article
            className="note-detail-card"
            aria-busy={reactionSummaryLoading}
          >
            <div className="note-detail-topline">
              <h1 className="note-detail-title">{getNoteTitle(note)}</h1>
              <ReadOnlyRatingStars value={note.Rating} />
            </div>

            <button
              className="note-detail-place"
              type="button"
              onClick={() =>
                onOpenPlace?.({
                  placeId: note.PlaceId,
                  placeName: note.PlaceName,
                  venueCategoryCode: note.VenueCategoryCode,
                })
              }
              disabled={!note.PlaceId || !onOpenPlace}
              title="Mekan sayfasını aç"
            >
              <strong className="note-detail-place-title">
                <span
                  className="venue-category-icon venue-category-icon-detail"
                  title={getVenueCategoryLabel(note.VenueCategoryCode)}
                  aria-hidden="true"
                >
                  {getVenueCategoryIcon(note.VenueCategoryCode)}
                </span>
                {note.PlaceName || "İsimsiz mekan"}
              </strong>
              {note.FormattedAddress && <span>{note.FormattedAddress}</span>}
            </button>

            <section className="note-detail-copy">
              <h2>Detay</h2>
              <p>{note.Content || "Bu not için detay eklenmemiş."}</p>
            </section>

            <dl className="note-detail-meta">
              <div>
                <dt>Ziyaret tarihi</dt>
                <dd>{formatDate(note.VisitedDate) || "Belirtilmedi"}</dd>
              </div>
              <div>
                <dt>Not zamanı</dt>
                <dd>
                  {formatDate(note.CreatedDate, {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  }) || "Belirtilmedi"}
                </dd>
              </div>
            </dl>

            <NoteReactionControls
              noteId={note.PlaceNoteId}
              noteOwnerUserId={note.UserId}
              currentUserId={currentUserId}
              summary={reactionSummary}
              onSummaryChange={(_noteId, nextSummary) =>
                setReactionSummary(normalizeReactionSummary(nextSummary))
              }
              variant="detail"
            />

            <NotePhotoGallery
              photos={notePhotos}
              loading={photosLoading}
              errorMessage={photosError}
              onRetry={loadNotePhotos}
            />
          </article>
        )}
      </div>

      {isEditModalOpen && note &&
        createPortal(
          <NoteEditModal
            note={note}
            noteId={Number(note.PlaceNoteId)}
            existingPhotos={notePhotos}
            isSaving={isSavingEdit}
            errorMessage={editError}
            onCancel={closeEditModal}
            onCompleted={completeEditModal}
            onPhotosChanged={handleEditedPhotosChanged}
            onSave={handleEditSave}
          />,
          document.body
        )}

      {isDeleteModalOpen &&
        createPortal(
          <NoteDeleteConfirmModal
            isDeleting={isDeleting}
            errorMessage={deleteError}
            onCancel={closeDeleteModal}
            onConfirm={handleDelete}
          />,
          document.body
        )}
    </div>
  );
}

export function NotePhotoGallery({ photos, loading, errorMessage, onRetry }) {
  const [activePhotoIndex, setActivePhotoIndex] = useState(null);
  const activePhoto =
    Number.isInteger(activePhotoIndex) && activePhotoIndex >= 0
      ? photos[activePhotoIndex]
      : null;

  if (loading) {
    return (
      <section className="note-detail-photo-section" aria-busy="true">
        <div className="note-detail-photo-heading">
          <h2>Fotoğraflar</h2>
        </div>
        <p className="note-detail-photo-state">Fotoğraflar yükleniyor...</p>
      </section>
    );
  }

  if (errorMessage) {
    return (
      <section className="note-detail-photo-section">
        <div className="note-detail-photo-heading">
          <h2>Fotoğraflar</h2>
        </div>
        <div className="note-detail-photo-error">
          <p>{errorMessage}</p>
          <button type="button" onClick={onRetry}>
            Tekrar dene
          </button>
        </div>
      </section>
    );
  }

  if (photos.length === 0) {
    return null;
  }

  return (
    <section className="note-detail-photo-section">
      <div className="note-detail-photo-heading">
        <h2>Fotoğraflar</h2>
        <span>{photos.length}</span>
      </div>

      <div className={`note-detail-photo-grid note-detail-photo-grid-${Math.min(photos.length, 5)}`}>
        {photos.map((photo, index) => (
          <button
            className="note-detail-photo-tile"
            type="button"
            key={photo.PlaceNotePhotoId}
            onClick={() => setActivePhotoIndex(index)}
            title="Fotoğrafı büyüt"
          >
            <img src={photo.SignedUrl} alt="Mekan notu fotoğrafı" />
          </button>
        ))}
      </div>

      {activePhoto &&
        createPortal(
          <div
            className="note-photo-lightbox"
            role="dialog"
            aria-modal="true"
            aria-label="Fotoğraf görüntüleyici"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setActivePhotoIndex(null);
              }
            }}
          >
            <button
              className="note-photo-lightbox-close"
              type="button"
              onClick={() => setActivePhotoIndex(null)}
              aria-label="Fotoğrafı kapat"
            >
              ×
            </button>
            <img src={activePhoto.SignedUrl} alt="Mekan notu fotoğrafı" />
          </div>,
          document.body
        )}
    </section>
  );
}

export function NotePhotoManagerModal({ noteId, existingPhotos, onClose, onChanged }) {
  const [photoDrafts, setPhotoDrafts] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingPhotoId, setDeletingPhotoId] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const photoDraftsRef = useRef([]);

  useEffect(() => {
    return () => {
      revokeNotePhotoDrafts(photoDraftsRef.current);
    };
  }, []);

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === "Escape" && !isSaving && !deletingPhotoId) {
        onClose();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [deletingPhotoId, isSaving, onClose]);

  const setDrafts = (nextDrafts) => {
    photoDraftsRef.current = nextDrafts;
    setPhotoDrafts(nextDrafts);
  };

  const handleFilesSelected = (files) => {
    const selectedFiles = Array.from(files ?? []);
    const selectionError = getPhotoSelectionError(
      selectedFiles,
      existingPhotos.length + photoDraftsRef.current.length
    );

    if (selectionError) {
      setErrorMessage(selectionError);
      return;
    }

    setDrafts([
      ...photoDraftsRef.current,
      ...createNotePhotoDrafts(selectedFiles),
    ]);
    setErrorMessage("");
  };

  const removeDraft = (draftId) => {
    const currentDrafts = photoDraftsRef.current;
    const removedDraft = currentDrafts.find((draft) => draft.id === draftId);

    if (removedDraft) {
      revokeNotePhotoDrafts([removedDraft]);
    }

    setDrafts(currentDrafts.filter((draft) => draft.id !== draftId));
    setErrorMessage("");
  };

  const uploadDrafts = async () => {
    if (photoDraftsRef.current.length === 0 || isSaving) {
      return;
    }

    setIsSaving(true);
    setErrorMessage("");

    try {
      await uploadMyNotePhotoDrafts(noteId, photoDraftsRef.current);
      revokeNotePhotoDrafts(photoDraftsRef.current);
      setDrafts([]);
      await Promise.resolve(onChanged?.());
    } catch (error) {
      console.error("Not fotoğrafları yüklenemedi:", error);
      setErrorMessage(error?.message || "Fotoğraflar yüklenemedi. Tekrar dene.");
    } finally {
      setIsSaving(false);
    }
  };

  const deletePhoto = async (photoId) => {
    if (!photoId || deletingPhotoId || isSaving) {
      return;
    }

    setDeletingPhotoId(photoId);
    setErrorMessage("");

    const { error } = await supabase.rpc("DeleteMyPlaceNotePhoto", {
      p_place_note_photo_id: Number(photoId),
    });

    if (error) {
      console.error("Not fotoğrafı silinemedi:", error);
      setErrorMessage(error.message || "Fotoğraf silinemedi. Tekrar dene.");
      setDeletingPhotoId(null);
      return;
    }

    await Promise.resolve(onChanged?.());
    setDeletingPhotoId(null);
  };

  const totalCount = existingPhotos.length + photoDrafts.length;

  return (
    <div
      className="note-photo-manager-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (!isSaving && !deletingPhotoId && event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        className="note-photo-manager"
        role="dialog"
        aria-modal="true"
        aria-labelledby="note-photo-manager-title"
      >
        <div className="note-photo-manager-header">
          <div>
            <p className="eyebrow">FOTOĞRAFLAR</p>
            <h2 id="note-photo-manager-title">Not fotoğraflarını yönet</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving || Boolean(deletingPhotoId)}
            aria-label="Kapat"
          >
            ×
          </button>
        </div>

        <p className="note-photo-manager-hint">
          En fazla {MAX_NOTE_PHOTOS} fotoğraf ekleyebilirsin. JPG, PNG ve WEBP desteklenir.
        </p>

        {totalCount < MAX_NOTE_PHOTOS && (
          <label className={`note-photo-picker${isSaving ? " note-photo-picker-disabled" : ""}`}>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              disabled={isSaving || Boolean(deletingPhotoId)}
              onChange={(event) => {
                handleFilesSelected(event.target.files);
                event.target.value = "";
              }}
            />
            <span aria-hidden="true">＋</span>
            <strong>Fotoğraf ekle</strong>
            <small>{totalCount} / {MAX_NOTE_PHOTOS} · Fotoğraf başına en fazla 8 MB</small>
          </label>
        )}

        {(existingPhotos.length > 0 || photoDrafts.length > 0) && (
          <div className="note-photo-manager-grid">
            {existingPhotos.map((photo) => (
              <div className="note-photo-draft note-photo-existing" key={photo.PlaceNotePhotoId}>
                <img src={photo.SignedUrl} alt="Not fotoğrafı" />
                <button
                  type="button"
                  disabled={isSaving || Boolean(deletingPhotoId)}
                  onClick={() => deletePhoto(photo.PlaceNotePhotoId)}
                  aria-label="Fotoğrafı sil"
                  title="Fotoğrafı sil"
                >
                  {Number(deletingPhotoId) === Number(photo.PlaceNotePhotoId) ? "…" : "×"}
                </button>
              </div>
            ))}
            {photoDrafts.map((draft) => (
              <div className="note-photo-draft" key={draft.id}>
                <img src={draft.previewUrl} alt="Yeni fotoğraf ön izlemesi" />
                <button
                  type="button"
                  disabled={isSaving || Boolean(deletingPhotoId)}
                  onClick={() => removeDraft(draft.id)}
                  aria-label={`${draft.name} fotoğrafını kaldır`}
                  title="Fotoğrafı kaldır"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {errorMessage && <p className="note-photo-manager-error" role="alert">{errorMessage}</p>}

        <div className="note-photo-manager-actions">
          <button type="button" disabled={isSaving || Boolean(deletingPhotoId)} onClick={onClose}>
            Bitti
          </button>
          <button
            className="note-photo-manager-save"
            type="button"
            disabled={isSaving || Boolean(deletingPhotoId) || photoDrafts.length === 0}
            onClick={uploadDrafts}
          >
            {isSaving ? "Yükleniyor..." : "Fotoğrafları yükle"}
          </button>
        </div>
      </section>
    </div>
  );
}

export function NoteEditModal({
  note,
  noteId,
  existingPhotos = [],
  isSaving,
  errorMessage,
  onCancel,
  onCompleted,
  onPhotosChanged,
  onSave,
}) {
  const titleInputRef = useRef(null);
  const photoDraftsRef = useRef([]);
  const [form, setForm] = useState(() => ({
    title: String(note?.Title ?? "").trim(),
    rating: Number(note?.Rating) || 0,
    content: String(note?.Content ?? ""),
    visitedDate: toDateInputValue(note?.VisitedDate),
  }));
  const [hasAttemptedSave, setHasAttemptedSave] = useState(false);
  const [photoDrafts, setPhotoDrafts] = useState([]);
  const [photoError, setPhotoError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingPhotoId, setDeletingPhotoId] = useState(null);

  const today = getIstanbulDateInputValue();
  const validation = {
    title: !form.title.trim(),
    rating:
      !Number.isInteger(Number(form.rating)) ||
      Number(form.rating) < 1 ||
      Number(form.rating) > 5,
    detail: !form.content.trim(),
    visitedDate: Boolean(form.visitedDate && form.visitedDate > today),
  };
  const canSave = !Object.values(validation).some(Boolean);
  const isBusy = isSaving || isSubmitting || Boolean(deletingPhotoId);
  const totalPhotoCount = existingPhotos.length + photoDrafts.length;

  useEffect(() => {
    titleInputRef.current?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleEscape = (event) => {
      if (event.key === "Escape" && !isBusy) {
        onCancel();
      }
    };

    window.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isBusy, onCancel]);

  useEffect(() => {
    return () => {
      revokeNotePhotoDrafts(photoDraftsRef.current);
    };
  }, []);

  const setDrafts = (nextDrafts) => {
    photoDraftsRef.current = nextDrafts;
    setPhotoDrafts(nextDrafts);
  };

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleBackdropMouseDown = (event) => {
    if (!isBusy && event.target === event.currentTarget) {
      onCancel();
    }
  };

  const handleFilesSelected = (files) => {
    const selectedFiles = Array.from(files ?? []);
    const selectionError = getPhotoSelectionError(
      selectedFiles,
      existingPhotos.length + photoDraftsRef.current.length
    );

    if (selectionError) {
      setPhotoError(selectionError);
      return;
    }

    setDrafts([
      ...photoDraftsRef.current,
      ...createNotePhotoDrafts(selectedFiles),
    ]);
    setPhotoError("");
  };

  const removeDraft = (draftId) => {
    const currentDrafts = photoDraftsRef.current;
    const removedDraft = currentDrafts.find((draft) => draft.id === draftId);

    if (removedDraft) {
      revokeNotePhotoDrafts([removedDraft]);
    }

    setDrafts(currentDrafts.filter((draft) => draft.id !== draftId));
    setPhotoError("");
  };

  const deleteExistingPhoto = async (photoId) => {
    if (!photoId || isBusy) {
      return;
    }

    setDeletingPhotoId(photoId);
    setPhotoError("");

    try {
      const { error } = await supabase.rpc("DeleteMyPlaceNotePhoto", {
        p_place_note_photo_id: Number(photoId),
      });

      if (error) {
        throw error;
      }

      await Promise.resolve(onPhotosChanged?.());
    } catch (error) {
      console.error("Not fotoğrafı silinemedi:", error);
      setPhotoError(error?.message || "Fotoğraf silinemedi. Tekrar dene.");
    } finally {
      setDeletingPhotoId(null);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (isBusy) {
      return;
    }

    if (!canSave) {
      setHasAttemptedSave(true);
      return;
    }

    setIsSubmitting(true);
    setPhotoError("");

    try {
      const didSave = await onSave({
        title: form.title.trim(),
        rating: Number(form.rating),
        content: form.content.trim(),
        visitedDate: form.visitedDate || null,
      });

      if (!didSave) {
        return;
      }

      if (photoDraftsRef.current.length > 0) {
        try {
          await uploadMyNotePhotoDrafts(noteId, photoDraftsRef.current);
          revokeNotePhotoDrafts(photoDraftsRef.current);
          setDrafts([]);
          await Promise.resolve(onPhotosChanged?.());
        } catch (error) {
          console.error("Not fotoğrafları yüklenemedi:", error);
          setPhotoError(
            error?.message ||
              "Not güncellendi, ancak fotoğraflar yüklenemedi. Tekrar deneyebilirsin."
          );
          return;
        }
      }

      onCompleted();
    } finally {
      setIsSubmitting(false);
    }
  };

  const showTitleError = hasAttemptedSave && validation.title;
  const showRatingError = hasAttemptedSave && validation.rating;
  const showDetailError = hasAttemptedSave && validation.detail;
  const showVisitedDateError = hasAttemptedSave && validation.visitedDate;

  return (
    <div
      className="note-edit-modal-backdrop"
      role="presentation"
      onMouseDown={handleBackdropMouseDown}
    >
      <section
        className="note-edit-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="note-edit-title"
      >
        <div className="note-edit-modal-header">
          <div>
            <p className="eyebrow">NOTU DÜZENLE</p>
            <h2 id="note-edit-title">{note.PlaceName || "Mekan notu"}</h2>
          </div>
          <button
            className="note-edit-modal-close"
            type="button"
            onClick={onCancel}
            disabled={isBusy}
            aria-label="Kapat"
          >
            ×
          </button>
        </div>

        <form className="note-edit-form" onSubmit={handleSubmit}>
          <label>
            <span>Başlık</span>
            <input
              ref={titleInputRef}
              type="text"
              value={form.title}
              disabled={isBusy}
              maxLength={120}
              aria-invalid={showTitleError}
              onChange={(event) => updateField("title", event.target.value)}
              placeholder="Kısa bir başlık yaz"
            />
            {showTitleError && (
              <small className="note-edit-field-error" role="alert">
                Başlık zorunlu.
              </small>
            )}
          </label>

          <div className="note-edit-rating-field">
            <span>Puanın</span>
            <div
              className={`note-edit-rating-picker${
                showRatingError ? " note-edit-rating-picker-error" : ""
              }`}
              role="radiogroup"
              aria-label="Puanın"
            >
              {[1, 2, 3, 4, 5].map((rating) => (
                <button
                  className={
                    rating <= Number(form.rating)
                      ? "note-edit-rating-star note-edit-rating-star-active"
                      : "note-edit-rating-star"
                  }
                  type="button"
                  key={rating}
                  role="radio"
                  aria-checked={Number(form.rating) === rating}
                  aria-label={`${rating} yıldız`}
                  disabled={isBusy}
                  onClick={() => updateField("rating", rating)}
                >
                  ★
                </button>
              ))}
              <strong>{form.rating ? `${form.rating} / 5` : "Puan ver"}</strong>
            </div>
            {showRatingError && (
              <small className="note-edit-field-error" role="alert">
                1 ile 5 arasında puan vermelisin.
              </small>
            )}
          </div>

          <label>
            <span>Ziyaret tarihi <small>(opsiyonel)</small></span>
            <input
              type="date"
              value={form.visitedDate}
              max={today}
              disabled={isBusy}
              aria-invalid={showVisitedDateError}
              onChange={(event) => updateField("visitedDate", event.target.value)}
            />
            {showVisitedDateError && (
              <small className="note-edit-field-error" role="alert">
                Ziyaret tarihi gelecekte olamaz.
              </small>
            )}
          </label>

          <label>
            <span>Detay</span>
            <textarea
              value={form.content}
              disabled={isBusy}
              maxLength={1000}
              aria-invalid={showDetailError}
              onChange={(event) => updateField("content", event.target.value)}
              placeholder="Bu mekan hakkında ne düşünüyorsun?"
            />
            {showDetailError && (
              <small className="note-edit-field-error" role="alert">
                Not detayını yazmalısın.
              </small>
            )}
          </label>

          <div className="note-photo-upload-field" aria-label="Not fotoğrafları">
            <div className="note-photo-upload-heading">
              <span>
                Fotoğraflar <small>(opsiyonel)</small>
              </span>
              <small>{totalPhotoCount} / {MAX_NOTE_PHOTOS}</small>
            </div>

            {totalPhotoCount < MAX_NOTE_PHOTOS && (
              <label
                className={`note-photo-picker${
                  isBusy ? " note-photo-picker-disabled" : ""
                }`}
              >
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  disabled={isBusy}
                  onChange={(event) => {
                    handleFilesSelected(event.target.files);
                    event.target.value = "";
                  }}
                />
                <span aria-hidden="true">＋</span>
                <strong>Fotoğraf ekle</strong>
                <small>JPG, PNG veya WEBP · Fotoğraf başına en fazla 8 MB</small>
              </label>
            )}

            {(existingPhotos.length > 0 || photoDrafts.length > 0) && (
              <div className="note-photo-draft-grid" aria-label="Not fotoğrafları">
                {existingPhotos.map((photo) => (
                  <div
                    className="note-photo-draft note-photo-existing"
                    key={photo.PlaceNotePhotoId}
                  >
                    <img src={photo.SignedUrl} alt="Not fotoğrafı" />
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => deleteExistingPhoto(photo.PlaceNotePhotoId)}
                      aria-label="Fotoğrafı sil"
                      title="Fotoğrafı sil"
                    >
                      {Number(deletingPhotoId) === Number(photo.PlaceNotePhotoId)
                        ? "…"
                        : "×"}
                    </button>
                  </div>
                ))}

                {photoDrafts.map((draft) => (
                  <div className="note-photo-draft" key={draft.id}>
                    <img src={draft.previewUrl} alt="Yeni fotoğraf ön izlemesi" />
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => removeDraft(draft.id)}
                      aria-label="Seçilen fotoğrafı kaldır"
                      title="Seçilen fotoğrafı kaldır"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {photoError && (
            <p className="note-edit-modal-error" role="alert">
              {photoError}
            </p>
          )}

          {errorMessage && (
            <p className="note-edit-modal-error" role="alert">
              {errorMessage}
            </p>
          )}

          <div className="note-edit-modal-actions">
            <button
              className="note-edit-modal-cancel"
              type="button"
              disabled={isBusy}
              onClick={onCancel}
            >
              Vazgeç
            </button>
            <button
              className={`note-edit-modal-save${
                canSave ? "" : " note-edit-modal-save-incomplete"
              }`}
              type="submit"
              disabled={isBusy}
              aria-disabled={!canSave || isBusy}
            >
              {isBusy ? "Kaydediliyor..." : "Değişiklikleri kaydet"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export function NoteDeleteConfirmModal({
  isDeleting,
  errorMessage,
  onCancel,
  onConfirm,
}) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const handleBackdropMouseDown = (event) => {
    if (!isDeleting && event.target === event.currentTarget) {
      onCancel();
    }
  };

  return (
    <div
      className="note-delete-modal-backdrop"
      role="presentation"
      onMouseDown={handleBackdropMouseDown}
    >
      <section
        ref={dialogRef}
        className="note-delete-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="note-delete-title"
        aria-describedby="note-delete-description"
        tabIndex={-1}
      >
        <p className="eyebrow">NOTU SİL</p>
        <h2 id="note-delete-title">Bu not silinsin mi?</h2>
        <p id="note-delete-description">
          Bu not artık hiçbir listede, mekan yorumlarında veya haritada görünmeyecek.
        </p>

        {errorMessage && (
          <p className="note-delete-modal-error" role="alert">
            {t(errorMessage)}
          </p>
        )}

        <div className="note-delete-modal-actions">
          <button
            type="button"
            className="note-delete-modal-cancel"
            disabled={isDeleting}
            onClick={onCancel}
          >
            Vazgeç
          </button>
          <button
            type="button"
            className="note-delete-modal-confirm"
            disabled={isDeleting}
            onClick={onConfirm}
          >
            {isDeleting ? "Siliniyor..." : "Notu sil"}
          </button>
        </div>
      </section>
    </div>
  );
}

export function LoadingState({ compact = false }) {
  return (
    <div className={`list-state${compact ? " list-state-compact" : ""}`}>
      <span className="list-loading-dot" aria-hidden="true" />
      <span>Yükleniyor...</span>
    </div>
  );
}

export function ErrorState({ message, onRetry, compact = false }) {
  return (
    <div
      className={`list-state list-state-error${compact ? " list-state-compact" : ""}`}
    >
      <p>{t(message)}</p>
      <button type="button" onClick={onRetry}>
        Tekrar dene
      </button>
    </div>
  );
}

export function EmptyCollectionState({ icon, title, message, compact = false }) {
  return (
    <div
      className={`list-state${compact ? " list-state-compact" : ""}`}
    >
      <div className="empty-icon">{icon}</div>
      <h2>{title}</h2>
      {message && <p>{message}</p>}
    </div>
  );
}
