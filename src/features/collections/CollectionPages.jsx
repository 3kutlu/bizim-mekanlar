/*
 * Refactored from the application root.
 * This feature module intentionally keeps existing UI behavior intact.
 */

import ShareIconButton from "../../components/ShareIconButton.jsx";
import { MESSAGE_KEY } from "../../i18n/messages.js";
import { supabase } from "../../supabase.js";
import { useProfilePhotoUrls } from "../../utils/profilePhotos.js";
import { getVenueCategoryIcon } from "../../utils/venueCategory.js";
import { PROFILE_COLLECTIONS, formatRelativeNoteTime, getFullName, isPrivateAccount } from "../app/appShared.jsx";
import { EmptyCollectionState, ErrorState, LoadingState, NoteFeed } from "../notes/NoteComponents.jsx";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PlaceListEditModal } from "./CollectionEditorModal.jsx";

export { PlaceListEditModal };

export function PlaceListDetailPage({
  userPlaceListId,
  listName,
  listIcon,
  listDescription = "",
  listCoverUrl = "",
  profileUsername,
  isOwner = false,
  isActive,
  onBack,
  onOpenPlace,
  onListChanged,
  onShare,
}) {
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [sortBy, setSortBy] = useState("saved");
  const [savedDateDirection, setSavedDateDirection] = useState("desc");
  const [removalTarget, setRemovalTarget] = useState(null);

  const loadItems = useCallback(async () => {
    const normalizedListId = Number(userPlaceListId);

    if (!Number.isInteger(normalizedListId) || normalizedListId <= 0) {
      setItems([]);
      setErrorMessage("Liste bilgisi geçersiz.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage("");

    const { data, error } = await supabase.rpc("GetUserPlaceListItemsV3", {
      p_user_place_list_id: normalizedListId,
    });

    if (error) {
      console.error("Liste mekanları alınamadı:", error);
      setItems([]);
      setErrorMessage(
        error.message || "Bu listenin mekanları şu an yüklenemedi."
      );
    } else {
      setItems(data ?? []);
    }

    setIsLoading(false);
  }, [userPlaceListId]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  useEffect(() => {
    if (!isActive) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        if (removalTarget) {
          setRemovalTarget(null);
        } else {
          onBack();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isActive, onBack, removalTarget]);

  const sortedItems = useMemo(() => {
    const copy = [...items];

    return copy.sort((left, right) => {
      if (sortBy === "name") {
        return String(left?.Name ?? "").localeCompare(
          String(right?.Name ?? ""),
          "tr"
        );
      }

      if (sortBy === "rating") {
        const leftRating = Number(left?.AverageRating);
        const rightRating = Number(right?.AverageRating);
        const leftValue = Number.isFinite(leftRating) ? leftRating : -1;
        const rightValue = Number.isFinite(rightRating) ? rightRating : -1;

        if (leftValue !== rightValue) {
          return rightValue - leftValue;
        }
      }

      const leftDate = new Date(
        left?.SavedDate ?? left?.CreatedDate ?? 0
      ).getTime();
      const rightDate = new Date(
        right?.SavedDate ?? right?.CreatedDate ?? 0
      ).getTime();

      return savedDateDirection === "asc"
        ? leftDate - rightDate
        : rightDate - leftDate;
    });
  }, [items, savedDateDirection, sortBy]);

  const normalizedListName = String(listName ?? "").trim() || "Mekan listesi";

  const handleRemoved = useCallback(
    ({ placeId, removeFromAll }) => {
      const normalizedPlaceId = Number(placeId);

      setItems((currentItems) =>
        currentItems.filter((item) => {
          const currentPlaceId = Number(item?.PlaceId);

          if (removeFromAll) {
            return currentPlaceId !== normalizedPlaceId;
          }

          return currentPlaceId !== normalizedPlaceId;
        })
      );
      setRemovalTarget(null);
      onListChanged?.();
    },
    [onListChanged]
  );

  return (
    <div className="discovery-page-content place-list-detail-page">
      <header className="discovery-page-header discovery-page-header-no-back place-list-detail-header">
        <div className="place-list-detail-heading">
          <div className="place-list-detail-heading-copy">
            {profileUsername && <p className="eyebrow">@{profileUsername}</p>}
            <div className="place-list-detail-title-row">
              {listCoverUrl ? (
                <img
                  className="place-list-detail-cover"
                  src={listCoverUrl}
                  alt=""
                />
              ) : (
                <span className="place-list-detail-title-icon" aria-hidden="true">
                  {listIcon || "✦"}
                </span>
              )}
              <div>
                <h1>{normalizedListName}</h1>
                {listDescription && (
                  <p className="place-list-detail-description">{listDescription}</p>
                )}
              </div>
            </div>
          </div>
          <ShareIconButton
            className="place-list-detail-share-button"
            onClick={onShare}
            disabled={!onShare}
            label="Koleksiyonu paylaş"
          />
        </div>

      </header>

      <div className="discovery-page-body place-list-detail-body">
        {isLoading && <LoadingState compact />}

        {!isLoading && errorMessage && (
          <ErrorState message={errorMessage} onRetry={loadItems} compact />
        )}

        {!isLoading && !errorMessage && items.length === 0 && (
          <EmptyCollectionState
            compact
            icon={listIcon || "✦"}
            title="Bu listede henüz mekan yok"
            message={
              isOwner
                ? "Haritadaki Kaydet alanından mekan eklediğinde burada görünür."
                : "Bu koleksiyona henüz mekan eklenmemiş."
            }
          />
        )}

        {!isLoading && !errorMessage && items.length > 0 && (
          <>
            <div
              className="place-list-sort"
              role="group"
              aria-label="Koleksiyonu sırala"
            >
              <span>Sırala</span>
              <button
                type="button"
                className={sortBy === "saved" ? "place-list-sort-active" : ""}
                onClick={() => {
                  if (sortBy === "saved") {
                    setSavedDateDirection((currentDirection) =>
                      currentDirection === "desc" ? "asc" : "desc"
                    );
                    return;
                  }

                  setSortBy("saved");
                  setSavedDateDirection("desc");
                }}
                aria-label={
                  savedDateDirection === "desc"
                    ? "Tarihe göre sırala: en yeni üstte. En eskiyi görmek için tekrar dokun."
                    : "Tarihe göre sırala: en eski üstte. En yeniyi görmek için tekrar dokun."
                }
                title={
                  savedDateDirection === "desc"
                    ? "En yeni üstte · değiştirmek için dokun"
                    : "En eski üstte · değiştirmek için dokun"
                }
              >
                {savedDateDirection === "desc" ? "Tarih ↓" : "Tarih ↑"}
              </button>
              <button
                type="button"
                className={sortBy === "name" ? "place-list-sort-active" : ""}
                onClick={() => setSortBy("name")}
              >
                İsim
              </button>
              <button
                type="button"
                className={sortBy === "rating" ? "place-list-sort-active" : ""}
                onClick={() => setSortBy("rating")}
              >
                Puan
              </button>
            </div>

            <div
              className="place-list-items"
              aria-label={`${normalizedListName} mekanları`}
            >
              {sortedItems.map((item) => {
                const placeId = Number(item?.PlaceId);
                const canOpenPlace = Number.isInteger(placeId) && placeId > 0;
                const venueCategoryCode = item?.VenueCategoryCode;
                const savedDate = item?.SavedDate ?? item?.CreatedDate;
                const averageRating = Number(item?.AverageRating);
                const hasRating = Number.isFinite(averageRating) && averageRating > 0;

                return (
                  <article
                    className="place-list-item-card"
                    key={item?.UserPlaceListItemId ?? placeId}
                  >
                    <button
                      className="place-list-item-main"
                      type="button"
                      disabled={!canOpenPlace}
                      onClick={() =>
                        canOpenPlace &&
                        onOpenPlace?.({
                          placeId,
                          placeName: item?.Name,
                          venueCategoryCode,
                        })
                      }
                      title={canOpenPlace ? "Mekan sayfasını aç" : undefined}
                    >
                      <span className="place-list-item-icon" aria-hidden="true">
                        {getVenueCategoryIcon(venueCategoryCode)}
                      </span>
                      <span className="place-list-item-copy">
                        <strong>{item?.Name || "İsimsiz mekan"}</strong>
                        <span>
                          {item?.FormattedAddress || "Adres bilgisi yok"}
                        </span>
                        <small className="place-list-item-meta">
                          {savedDate && `Kaydedildi ${formatRelativeNoteTime(savedDate)}`}
                          {hasRating && (
                            <>
                              {savedDate && <i aria-hidden="true">·</i>}
                              {averageRating.toFixed(1)} / 5
                            </>
                          )}
                        </small>
                      </span>
                      <span className="place-list-item-arrow" aria-hidden="true">
                        ›
                      </span>
                    </button>

                    {isOwner && (
                      <button
                        className="place-list-item-more-button"
                        type="button"
                        onClick={() => setRemovalTarget(item)}
                        aria-label={`${item?.Name || "Mekan"} için koleksiyon seçenekleri`}
                        title="Koleksiyon seçenekleri"
                      >
                        ⋯
                      </button>
                    )}
                  </article>
                );
              })}
            </div>
          </>
        )}
      </div>

      {isOwner && removalTarget &&
        createPortal(
          <PlaceListItemRemoveModal
            item={removalTarget}
            listId={userPlaceListId}
            listName={normalizedListName}
            onClose={() => setRemovalTarget(null)}
            onRemoved={handleRemoved}
          />,
          document.body
        )}
    </div>
  );
}

export function PlaceListItemRemoveModal({
  item,
  listId,
  listName,
  onClose,
  onRemoved,
}) {
  const [isRemoving, setIsRemoving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const dialogRef = useRef(null);
  const placeId = Number(item?.PlaceId);
  const placeName = String(item?.Name ?? "Mekan").trim() || "Mekan";

  useEffect(() => {
    dialogRef.current?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !isRemoving) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isRemoving, onClose]);

  const removePlace = async (removeFromAll) => {
    if (!Number.isInteger(placeId) || placeId <= 0 || isRemoving) {
      return;
    }

    setIsRemoving(true);
    setErrorMessage("");

    const { error } = await supabase.rpc("RemoveMyPlaceFromListV2", {
      p_user_place_list_id: Number(listId),
      p_place_id: placeId,
      p_remove_from_all: removeFromAll,
    });

    if (error) {
      console.error("Mekan koleksiyondan kaldırılamadı:", error);
      setErrorMessage(
        error.message || "Mekan koleksiyondan kaldırılamadı. Tekrar dene."
      );
      setIsRemoving(false);
      return;
    }

    onRemoved?.({ placeId, removeFromAll });
  };

  const handleBackdropMouseDown = (event) => {
    if (!isRemoving && event.target === event.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="place-list-remove-backdrop"
      role="presentation"
      onMouseDown={handleBackdropMouseDown}
    >
      <section
        ref={dialogRef}
        className="place-list-remove-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="place-list-remove-title"
        tabIndex={-1}
      >
        <p className="eyebrow">KOLEKSİYON</p>
        <h2 id="place-list-remove-title">{placeName}</h2>
        <p>
          Bu mekan <strong>{listName}</strong> listende kayıtlı.
        </p>

        {errorMessage && (
          <p className="place-list-remove-error" role="alert">
            {errorMessage}
          </p>
        )}

        <div className="place-list-remove-actions">
          <button
            className="place-list-remove-cancel"
            type="button"
            disabled={isRemoving}
            onClick={onClose}
          >
            Vazgeç
          </button>
          <button
            className="place-list-remove-current"
            type="button"
            disabled={isRemoving}
            onClick={() => removePlace(false)}
          >
            {isRemoving ? "Kaldırılıyor..." : "Bu listeden kaldır"}
          </button>
        </div>

        <button
          className="place-list-remove-all"
          type="button"
          disabled={isRemoving}
          onClick={() => removePlace(true)}
        >
          Tüm listelerden çıkar
        </button>
      </section>
    </div>
  );
}

export function ProfileCollectionPage({
  profileUserId,
  profileUsername,
  profileIsPrivate = false,
  type,
  isActive,
  refreshKey,
  currentUserId,
  onBack,
  onOpenPlace,
  onOpenUser,
  onOpenNote,
}) {
  const config = PROFILE_COLLECTIONS[type];
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const loadCollection = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");

    const request =
      type === "notes"
        ? supabase.rpc("GetProfileNoteCardsV2", {
            p_profile_user_id: profileUserId,
          })
        : supabase.rpc("GetProfileConnections", {
            p_profile_user_id: profileUserId,
            p_list_type: type === "followers" ? "FOLLOWERS" : "FOLLOWING",
          });

    const { data, error } = await request;

    if (error) {
      console.error("Profil listesi alınamadı:", error);
      setItems([]);
      setErrorMessage(MESSAGE_KEY.COLLECTION_LOAD_FAILED);
    } else {
      setItems(data ?? []);
    }

    setLoading(false);
  }, [profileUserId, type]);

  useEffect(() => {
    loadCollection();
  }, [loadCollection, refreshKey]);

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

  return (
    <div className="discovery-page-content collection-page">
      <header className="discovery-page-header discovery-page-header-no-back">
        <div>
          <p className="eyebrow">
            @{profileUsername}
            {profileIsPrivate ? " 🔒" : ""}
          </p>
          <h1>{config?.title || "Liste"}</h1>
        </div>

      </header>

      <div className="discovery-page-body">
        {loading && <LoadingState compact />}

        {!loading && errorMessage && (
          <ErrorState message={errorMessage} onRetry={loadCollection} compact />
        )}

        {!loading && !errorMessage && items.length === 0 && (
          <EmptyCollectionState
            compact
            icon={type === "notes" ? "✦" : "◉"}
            title={config?.emptyMessage || "Liste boş"}
            message=""
          />
        )}

        {!loading && !errorMessage && items.length > 0 && type === "notes" && (
          <NoteFeed
            notes={items}
            compact
            currentUserId={currentUserId}
            onOpenPlace={onOpenPlace}
            onOpenUser={onOpenUser}
            onOpenNote={onOpenNote}
          />
        )}

        {!loading && !errorMessage && items.length > 0 && type !== "notes" && (
          <ConnectionList users={items} onOpenUser={onOpenUser} />
        )}
      </div>
    </div>
  );
}

export function ConnectionList({ users, onOpenUser }) {
  const profilePhotoUrls = useProfilePhotoUrls(
    useMemo(() => users.map((user) => user?.UserId), [users])
  );

  return (
    <div className="connection-list">
      {users.map((user) => {
        const fullName = getFullName(user);
        const avatarLetter = (user.Username || fullName || "K")
          .charAt(0)
          .toUpperCase();
        const profilePhotoUrl = profilePhotoUrls[Number(user?.UserId)] || "";

        return (
          <button
            className="connection-list-item"
            type="button"
            key={user.UserId}
            onClick={() => onOpenUser?.(user.UserId)}
          >
            <span className="connection-avatar" aria-hidden="true">
              {profilePhotoUrl ? <img src={profilePhotoUrl} alt="" /> : avatarLetter}
            </span>

            <span className="connection-copy">
              <strong>
                {user.Username}
                {isPrivateAccount(user.AccountVisibilityCode) ? " 🔒" : ""}
              </strong>
              <span>{fullName || user.Username}</span>
              <small>
                {[user.CityName, user.ZodiacSign].filter(Boolean).join(" · ")}
              </small>
            </span>
          </button>
        );
      })}
    </div>
  );
}
