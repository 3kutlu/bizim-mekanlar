/*
 * Refactored from the application root.
 * This feature module intentionally keeps existing UI behavior intact.
 */

import { MESSAGE_KEY } from "../../i18n/messages.js";
import { supabase } from "../../supabase.js";
import { useProfilePhotoUrls } from "../../utils/profilePhotos.js";
import { getVenueCategoryIcon } from "../../utils/venueCategory.js";
import { filterUnavailableUsers, getMyUnavailableUserIds } from "../../utils/userRelationships.js";
import { PROFILE_COLLECTIONS, formatRelativeNoteTime, getFullName, isPrivateAccount } from "../app/appShared.jsx";
import { EmptyCollectionState, ErrorState, LoadingState, NoteFeed } from "../notes/NoteComponents.jsx";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PlaceListEditModal } from "./CollectionEditorModal.jsx";
import AppIcon, { CollectionIcon } from "../../components/AppIcon.jsx";

export { PlaceListEditModal };


function getCollectionMemberLetter(user) {
  return String(user?.Username || user?.FirstName || "K").charAt(0).toUpperCase();
}

function CollectionMemberAvatarStack({ members = [] }) {
  const visibleMembers = members.filter((member) => Number(member?.UserId) > 0);
  const photoUrls = useProfilePhotoUrls(
    visibleMembers.map((member) => Number(member?.UserId)),
    visibleMembers.length
  );

  if (visibleMembers.length <= 1) {
    return null;
  }

  return (
    <div className="place-list-collaborator-stack" aria-label="Koleksiyon ortakları">
      {visibleMembers.slice(0, 4).map((member) => {
        const userId = Number(member?.UserId);
        const photoUrl = photoUrls[userId] || "";

        return (
          <span className="place-list-collaborator-avatar" key={`${member?.RoleCode}-${userId}`} title={`@${member?.Username || "kullanici"}`}>
            {photoUrl ? <img src={photoUrl} alt="" /> : getCollectionMemberLetter(member)}
          </span>
        );
      })}
      {visibleMembers.length > 4 && (
        <span className="place-list-collaborator-avatar place-list-collaborator-more">+{visibleMembers.length - 4}</span>
      )}
    </div>
  );
}


export function PlaceListDetailPage({
  userPlaceListId,
  listName,
  listIcon,
  listDescription = "",
  listCoverUrl = "",
  profileUsername,
  ownerUserId = null,
  isOwner = false,
  canManageItems = false,
  isActive,
  onBack,
  onOpenPlace,
  onListChanged,
  onShare: _onShare,
}) {
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [sortBy, setSortBy] = useState("saved");
  const [savedDateDirection, setSavedDateDirection] = useState("desc");
  const [removalTarget, setRemovalTarget] = useState(null);
  const [collaborators, setCollaborators] = useState([]);

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

    const normalizedOwnerUserId = Number(ownerUserId);
    if (Number.isInteger(normalizedOwnerUserId) && normalizedOwnerUserId > 0) {
      try {
        const unavailableUserIds = await getMyUnavailableUserIds();
        if (unavailableUserIds.has(normalizedOwnerUserId)) {
          setItems([]);
          setErrorMessage("Bu koleksiyon bulunamadı.");
          setIsLoading(false);
          return;
        }
      } catch (relationshipError) {
        console.warn("Koleksiyon sahibi kontrol edilemedi:", relationshipError);
      }
    }

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
  }, [ownerUserId, userPlaceListId]);


  const loadCollaborators = useCallback(async () => {
    const normalizedListId = Number(userPlaceListId);

    if (!Number.isInteger(normalizedListId) || normalizedListId <= 0) {
      setCollaborators([]);
      return;
    }

    const { data, error } = await supabase.rpc("GetUserPlaceListCollaborators", {
      p_user_place_list_id: normalizedListId,
    });

    if (error) {
      console.warn("Koleksiyon ortakları alınamadı:", error);
      setCollaborators([]);
      return;
    }

    try {
      const unavailableUserIds = await getMyUnavailableUserIds();
      setCollaborators(
        filterUnavailableUsers(data ?? [], unavailableUserIds, ["UserId"])
      );
    } catch (relationshipError) {
      console.warn("Koleksiyon ortakları filtrelenemedi:", relationshipError);
      setCollaborators(data ?? []);
    }
  }, [userPlaceListId]);

  useEffect(() => {
    void loadItems();
    void loadCollaborators();
  }, [loadCollaborators, loadItems]);

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
  const isCollaborativeList = collaborators.filter((member) => Number(member?.UserId) > 0).length > 1;
  const emptyListMessage = canManageItems
    ? isCollaborativeList
      ? "Sen veya listedeki diğer kişiler haritadaki Kaydet alanından mekan eklediğinde burada görünür."
      : "Haritada bir mekan seçip Kaydet alanından bu listeye ekleyebilirsin."
    : "Bu koleksiyona henüz mekan eklenmemiş.";

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
                  <CollectionIcon value={listIcon} />
                </span>
              )}
              <div>
                <h1>{normalizedListName}</h1>
                {listDescription && (
                  <p className="place-list-detail-description">{listDescription}</p>
                )}
                <CollectionMemberAvatarStack members={collaborators} />
              </div>
            </div>
          </div>
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
            icon={<CollectionIcon value={listIcon} />}
            title={isCollaborativeList ? "Ortak liste hazır" : "Bu listede henüz mekan yok"}
            message={emptyListMessage}
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
                      <span className="place-list-item-arrow" aria-hidden="true"><AppIcon name="caret-right-fill" /></span>
                    </button>

                    {canManageItems && (
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

      {canManageItems && removalTarget &&
        createPortal(
          <PlaceListItemRemoveModal
            item={removalTarget}
            listId={userPlaceListId}
            listName={normalizedListName}
            onClose={() => setRemovalTarget(null)}
            isOwner={isOwner}
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
  isOwner = false,
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
          Bu mekan <strong>{listName}</strong> listesinde kayıtlı.
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

        {isOwner && (
        <button
          className="place-list-remove-all"
          type="button"
          disabled={isRemoving}
          onClick={() => removePlace(true)}
        >
          Tüm listelerden çıkar
        </button>
        )}
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
  onRelationshipChanged,
}) {
  const config = PROFILE_COLLECTIONS[type];
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [connectionActionTarget, setConnectionActionTarget] = useState(null);
  const [connectionActionBusy, setConnectionActionBusy] = useState("");
  const [connectionActionError, setConnectionActionError] = useState("");

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
      if (type === "notes") {
        try {
          const unavailableUserIds = await getMyUnavailableUserIds();
          setItems(
            filterUnavailableUsers(data ?? [], unavailableUserIds, ["UserId"])
          );
        } catch (relationshipError) {
          console.error("Profil notları ilişki filtresi uygulanamadı:", relationshipError);
          setItems(data ?? []);
        }
      } else {
        try {
          const unavailableUserIds = await getMyUnavailableUserIds();
          setItems(
            filterUnavailableUsers(data ?? [], unavailableUserIds, ["UserId"])
          );
        } catch (relationshipError) {
          console.error("Profil bağlantıları ilişki filtresi uygulanamadı:", relationshipError);
          setItems(data ?? []);
        }
      }
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
      if (event.key !== "Escape") {
        return;
      }

      if (connectionActionTarget) {
        setConnectionActionTarget(null);
        setConnectionActionError("");
        return;
      }

      onBack();
    };

    window.addEventListener("keydown", handleEscape);

    return () => window.removeEventListener("keydown", handleEscape);
  }, [connectionActionTarget, isActive, onBack]);

  const canManageFollowers =
    type === "followers" && Number(profileUserId) === Number(currentUserId);

  const handleConnectionAction = async (action) => {
    const targetUserId = Number(connectionActionTarget?.UserId);

    if (!Number.isInteger(targetUserId) || targetUserId <= 0 || connectionActionBusy) {
      return;
    }

    setConnectionActionBusy(action);
    setConnectionActionError("");

    const rpcName = action === "block" ? "BlockUser" : "RemoveFollower";
    const parameterName = action === "block"
      ? "p_blocked_user_id"
      : "p_follower_user_id";
    const { error } = await supabase.rpc(rpcName, {
      [parameterName]: targetUserId,
    });

    if (error) {
      console.error("Takipçi işlemi başarısız:", error);
      setConnectionActionError(
        error?.message || "İşlem şu an tamamlanamadı. Tekrar dene."
      );
      setConnectionActionBusy("");
      return;
    }

    setItems((currentItems) =>
      currentItems.filter((item) => Number(item?.UserId) !== targetUserId)
    );
    setConnectionActionBusy("");
    setConnectionActionTarget(null);
    await Promise.resolve(onRelationshipChanged?.());
  };

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
            message={
              type === "notes"
                ? "Görünür notlar burada listelenecek."
                : type === "followers"
                  ? "Takipçiler burada görünecek."
                  : "Takip edilen kullanıcılar burada görünecek."
            }
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
          <ConnectionList
            users={items}
            onOpenUser={onOpenUser}
            canManageFollowers={canManageFollowers}
            onOpenActions={setConnectionActionTarget}
          />
        )}
      </div>

      {connectionActionTarget &&
        createPortal(
          <div
            className="connection-action-backdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (!connectionActionBusy && event.target === event.currentTarget) {
                setConnectionActionTarget(null);
              }
            }}
          >
            <section
              className="connection-action-sheet"
              role="dialog"
              aria-modal="true"
              aria-labelledby="connection-action-title"
            >
              <p className="eyebrow">TAKİPÇİ İŞLEMLERİ</p>
              <h2 id="connection-action-title">@{connectionActionTarget.Username}</h2>
              <button
                type="button"
                disabled={Boolean(connectionActionBusy)}
                onClick={() => void handleConnectionAction("remove")}
              >
                <AppIcon name="user-circle-minus" />
                <span>
                  <strong>Takipçiden çıkar</strong>
                  <small>Bu kullanıcı seni takip etmeyi bırakır.</small>
                </span>
              </button>
              <button
                className="connection-action-danger"
                type="button"
                disabled={Boolean(connectionActionBusy)}
                onClick={() => void handleConnectionAction("block")}
              >
                <AppIcon name="x-circle" />
                <span>
                  <strong>Kullanıcıyı engelle</strong>
                  <small>İki yönlü takipler kaldırılır.</small>
                </span>
              </button>
              {connectionActionError && (
                <p className="connection-action-error" role="alert">
                  {connectionActionError}
                </p>
              )}
              <button
                className="connection-action-cancel"
                type="button"
                disabled={Boolean(connectionActionBusy)}
                onClick={() => setConnectionActionTarget(null)}
              >
                Vazgeç
              </button>
            </section>
          </div>,
          document.body
        )}
    </div>
  );
}

export function ConnectionList({
  users,
  onOpenUser,
  canManageFollowers = false,
  onOpenActions,
}) {
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
          <article className="connection-list-item" key={user.UserId}>
            <button
              className="connection-list-main"
              type="button"
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

            {canManageFollowers && (
              <button
                className="connection-list-more"
                type="button"
                onClick={() => onOpenActions?.(user)}
                aria-label={`@${user.Username} için takipçi seçenekleri`}
                title="Takipçi seçenekleri"
              >
                <AppIcon name="dots-three" />
              </button>
            )}
          </article>
        );
      })}
    </div>
  );
}
