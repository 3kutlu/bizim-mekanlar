import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabase.js";
import { getErrorMessageKey, MESSAGE_KEY, t } from "../i18n/messages.js";
import {
  getVenueCategoryIcon,
  getVenueCategoryLabel,
} from "../utils/venueCategory.js";
import { createSignedNotePhotoUrls } from "../utils/notePhotos.js";
import "../css/user-discovery.css";

const PROFILE_TABS = Object.freeze({
  NOTES: "notes",
  PHOTOS: "photos",
  SAVED: "saved",
});

function getFullName(profile) {
  return [profile?.FirstName, profile?.LastName].filter(Boolean).join(" ");
}

function getNoteTitle(note) {
  return String(note?.Title ?? "").trim() || "Başlıksız not";
}

function formatNoteRating(value) {
  const rating = Number(value);

  return Number.isInteger(rating) && rating >= 1 && rating <= 5
    ? `${rating} / 5`
    : "Puanlanmadı";
}

function formatRelativeTime(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const elapsed = Math.max(0, Date.now() - date.getTime());

  if (elapsed < 60_000) {
    return "şimdi";
  }

  if (elapsed < 60 * 60_000) {
    return `${Math.floor(elapsed / 60_000)} dk önce`;
  }

  if (elapsed < 24 * 60 * 60_000) {
    return `${Math.floor(elapsed / (60 * 60_000))} sa önce`;
  }

  if (elapsed < 7 * 24 * 60 * 60_000) {
    return `${Math.floor(elapsed / (24 * 60 * 60_000))} gün önce`;
  }

  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "short",
  }).format(date);
}

function ProfileCounter({ label, value, isClickable, onClick }) {
  const content = (
    <>
      <strong>{Number(value ?? 0)}</strong>
      <span>{label}</span>
    </>
  );

  if (!isClickable) {
    return (
      <span
        className="foreign-profile-follow-link foreign-profile-follow-link-locked"
        aria-label={`${Number(value ?? 0)} ${label}`}
      >
        {content}
      </span>
    );
  }

  return (
    <button
      className="foreign-profile-follow-link"
      type="button"
      onClick={onClick}
    >
      {content}
    </button>
  );
}
function ExternalNoteCard({ note, onOpenNote, onOpenPlace }) {
  const noteId = Number(
    note?.PlaceNoteId ?? note?.PlaceNoteID ?? note?.NoteId ?? note?.id
  );
  const placeId = Number(note?.PlaceId);
  const canOpenNote = Number.isInteger(noteId) && noteId > 0 && onOpenNote;
  const canOpenPlace = Number.isInteger(placeId) && placeId > 0 && onOpenPlace;
  const title = getNoteTitle(note);
  const placeName = note?.PlaceName || "Mekan";
  const venueCategoryCode = note?.VenueCategoryCode;

  const openNote = () => {
    if (canOpenNote) {
      onOpenNote(noteId);
    }
  };

  const handleKeyDown = (event) => {
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

  const placeContent = (
    <>
      <span
        className="venue-category-icon venue-category-icon-feed"
        title={getVenueCategoryLabel(venueCategoryCode)}
        aria-hidden="true"
      >
        {getVenueCategoryIcon(venueCategoryCode)}
      </span>
      {placeName}
    </>
  );

  return (
    <article
      className={`note-feed-card note-feed-card-profile${
        canOpenNote ? " note-feed-card-clickable" : ""
      }`}
      onClick={openNote}
      onKeyDown={handleKeyDown}
      tabIndex={canOpenNote ? 0 : undefined}
      aria-label={canOpenNote ? `${title} not detayını aç` : undefined}
    >
      <div className="note-feed-content">
        <div className="note-feed-header">
          <div className="note-feed-meta">
            {canOpenPlace ? (
              <button
                className="note-feed-place-link"
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenPlace({
                placeId,
                placeName,
                venueCategoryCode,
              });
                }}
                title="Mekan sayfasını aç"
              >
                {placeContent}
              </button>
            ) : (
              <span className="note-feed-place-link foreign-profile-note-place-static">
                {placeContent}
              </span>
            )}
          </div>
        </div>

        <div className="note-feed-summary-button">
          <strong>{title}</strong>
          <span>{formatNoteRating(note?.Rating)}</span>
        </div>

        <time
          className="note-feed-created-time"
          dateTime={note?.CreatedDate}
        >
          {formatRelativeTime(note?.CreatedDate)}
        </time>
      </div>
    </article>
  );
}

function LockedProfileTab({ type }) {
  const copy =
    type === PROFILE_TABS.SAVED
      ? "Kaydedilen listeler bu hesabı takip ettiğinde görünür."
      : type === PROFILE_TABS.PHOTOS
        ? "Fotoğraflar bu hesabı takip ettiğinde görünür."
        : "Notlar bu hesabı takip ettiğinde görünür.";

  return (
    <div className="foreign-profile-tab-state foreign-profile-tab-state-locked">
      <span aria-hidden="true">⌁</span>
      <h3>Bu hesap gizli</h3>
      <p>{copy}</p>
    </div>
  );
}

function EmptyProfileTab({ type }) {
  const copy =
    type === PROFILE_TABS.PHOTOS
      ? {
          icon: "▦",
          title: "Henüz fotoğraf paylaşılmadı",
          message:
            "Fotoğraflar yakında notlara bağlanarak burada görünecek.",
        }
      : type === PROFILE_TABS.SAVED
        ? {
            icon: "✦",
            title: "Görünür liste yok",
            message:
              "Bu kullanıcının herkese açık bir mekan listesi bulunmuyor.",
          }
        : {
            icon: "✦",
            title: "Henüz not yok",
            message: "Bu kullanıcı henüz görünür bir not paylaşmadı.",
          };

  return (
    <div className="foreign-profile-tab-state">
      <span aria-hidden="true">{copy.icon}</span>
      <h3>{copy.title}</h3>
      <p>{copy.message}</p>
    </div>
  );
}

export default function UserProfilePage({
  userId,
  isActive,
  placeListsRefreshKey = 0,
  onBack,
  onTitleChange,
  onOpenCollection,
  onOpenPlaceList,
  onFollowChanged,
  onOpenNote,
  onOpenPlace,
}) {
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [isActionLoading, setIsActionLoading] = useState(false);

  const [activeTab, setActiveTab] = useState(PROFILE_TABS.NOTES);
  const [notes, setNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesError, setNotesError] = useState("");
  const [photos, setPhotos] = useState([]);
  const [photosLoading, setPhotosLoading] = useState(false);
  const [photosError, setPhotosError] = useState("");
  const [savedLists, setSavedLists] = useState([]);
  const [savedListsLoading, setSavedListsLoading] = useState(false);
  const [savedListsError, setSavedListsError] = useState("");

  const loadProfile = useCallback(
    async ({ silent = false } = {}) => {
      if (!userId) {
        return;
      }

      if (!silent) {
        setIsLoading(true);
        setErrorMessage("");
      }

      const { data, error } = await supabase.rpc("GetExternalUserProfile", {
        p_profile_user_id: userId,
      });

      if (error) {
        console.error("Kullanıcı profili alınamadı:", error);

        if (!silent) {
          setProfile(null);
          setErrorMessage(
            getErrorMessageKey(error, MESSAGE_KEY.EXTERNAL_PROFILE_LOAD_FAILED)
          );
          setIsLoading(false);
        }
        return;
      }

      const profileData = Array.isArray(data) ? data[0] : data;

      if (!profileData) {
        if (!silent) {
          setProfile(null);
          setErrorMessage(MESSAGE_KEY.USER_NOT_FOUND_OR_INACTIVE);
          setIsLoading(false);
        }
        return;
      }

      setProfile(profileData);
      setErrorMessage("");

      if (!silent) {
        setIsLoading(false);
      }
    },
    [userId]
  );

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    const username = String(profile?.Username ?? "").trim();

    if (username) {
      onTitleChange?.(
        profile?.UserId ?? userId,
        username,
        profile?.AccountVisibilityCode
      );
    }
  }, [
    onTitleChange,
    profile?.AccountVisibilityCode,
    profile?.UserId,
    profile?.Username,
    userId,
  ]);

  useEffect(() => {
    if (!isActive || !userId) {
      return undefined;
    }

    const channel = supabase
      .channel(`external-profile-follow-state:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "UserFollows",
        },
        () => {
          void loadProfile({ silent: true });
        }
      )
      .subscribe((status, error) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error(
            "Profil takip durumu Realtime bağlantısı kurulamadı:",
            error
          );
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [isActive, loadProfile, userId]);

  useEffect(() => {
    if (!isActive || isActionLoading) {
      return undefined;
    }

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        onBack();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isActive, isActionLoading, onBack]);

  const canViewProfileContent = Boolean(profile?.CanViewCollections);

  const loadNotes = useCallback(async () => {
    if (!profile?.UserId || !canViewProfileContent) {
      return;
    }

    setNotesLoading(true);
    setNotesError("");

    const { data, error } = await supabase.rpc("GetProfileNoteCardsV2", {
      p_profile_user_id: profile.UserId,
    });

    if (error) {
      console.error("Dış profil notları alınamadı:", error);
      setNotes([]);
      setNotesError("Notlar şu an yüklenemedi. Tekrar dene.");
    } else {
      setNotes(data ?? []);
    }

    setNotesLoading(false);
  }, [canViewProfileContent, profile?.UserId]);

  const loadPhotos = useCallback(async () => {
    if (!profile?.UserId || !canViewProfileContent) {
      return;
    }

    setPhotosLoading(true);
    setPhotosError("");

    const { data, error } = await supabase.rpc("GetVisibleUserPlaceNotePhotos", {
      p_profile_user_id: Number(profile.UserId),
      p_limit: 80,
    });

    if (error) {
      console.error("Dış profil fotoğrafları alınamadı:", error);
      setPhotos([]);
      setPhotosError("Fotoğraflar şu an yüklenemedi. Tekrar dene.");
      setPhotosLoading(false);
      return;
    }

    try {
      setPhotos(await createSignedNotePhotoUrls(data ?? []));
    } catch (signedUrlError) {
      console.error("Dış profil fotoğraf bağlantıları oluşturulamadı:", signedUrlError);
      setPhotos([]);
      setPhotosError("Fotoğraflar şu an görüntülenemedi. Tekrar dene.");
    }

    setPhotosLoading(false);
  }, [canViewProfileContent, profile?.UserId]);

  const loadSavedLists = useCallback(async () => {
    if (!profile?.UserId || !canViewProfileContent) {
      return;
    }

    setSavedListsLoading(true);
    setSavedListsError("");

    const { data, error } = await supabase.rpc("GetVisibleUserPlaceListsV2", {
      p_profile_user_id: profile.UserId,
    });

    if (error) {
      console.error("Dış profil mekan listeleri alınamadı:", error);
      setSavedLists([]);
      setSavedListsError("Kaydedilenler şu an yüklenemedi. Tekrar dene.");
    } else {
      setSavedLists(data ?? []);
    }

    setSavedListsLoading(false);
  }, [canViewProfileContent, profile?.UserId]);

  useEffect(() => {
    if (!profile || !canViewProfileContent) {
      return;
    }

    if (activeTab === PROFILE_TABS.NOTES) {
      void loadNotes();
    }

    if (activeTab === PROFILE_TABS.PHOTOS) {
      void loadPhotos();
    }

    if (activeTab === PROFILE_TABS.SAVED) {
      void loadSavedLists();
    }
  }, [
    activeTab,
    canViewProfileContent,
    loadNotes,
    loadPhotos,
    loadSavedLists,
    placeListsRefreshKey,
    profile,
  ]);

  const handleFollowAction = async () => {
    if (!profile || isActionLoading) {
      return;
    }

    setIsActionLoading(true);
    setErrorMessage("");

    const shouldRemoveFollowRelation = ["ACCEPTED", "PENDING"].includes(
      profile.FollowStatusCode
    );
    const { error } = shouldRemoveFollowRelation
      ? await supabase.rpc("UnfollowUser", {
          p_following_user_id: profile.UserId,
        })
      : await supabase.rpc("RequestFollow", {
          p_following_user_id: profile.UserId,
        });

    if (error) {
      console.error("Takip işlemi başarısız:", error);
      setErrorMessage(
        getErrorMessageKey(error, MESSAGE_KEY.FOLLOW_ACTION_FAILED)
      );
      setIsActionLoading(false);
      return;
    }

    const nextFollowStatus = shouldRemoveFollowRelation
      ? "NONE"
      : profile.AccountVisibilityCode === "PRIVATE"
        ? "PENDING"
        : "ACCEPTED";

    setProfile((currentProfile) =>
      currentProfile
        ? {
            ...currentProfile,
            FollowStatusCode: nextFollowStatus,
          }
        : currentProfile
    );
    setIsActionLoading(false);

    void Promise.all([
      loadProfile({ silent: true }),
      Promise.resolve(onFollowChanged?.()),
    ]).catch((refreshError) => {
      console.error(
        "Takip işlemi sonrası sessiz yenileme başarısız:",
        refreshError
      );
    });
  };

  const visibilityIsPrivate = profile?.AccountVisibilityCode === "PRIVATE";
  const followStatus = profile?.FollowStatusCode || "NONE";
  const fullName = getFullName(profile);
  const avatarLetter = (profile?.Username || fullName || "K")
    .charAt(0)
    .toUpperCase();

  const followButtonLabel =
    followStatus === "ACCEPTED"
      ? "Takip ediliyor"
      : followStatus === "PENDING"
        ? "İsteği geri çek"
        : visibilityIsPrivate
          ? followStatus === "REJECTED"
            ? "Tekrar istek gönder"
            : "Takip isteği gönder"
          : "Takip et";

  const tabButtons = [
    { id: PROFILE_TABS.NOTES, label: "Notlar" },
    { id: PROFILE_TABS.PHOTOS, label: "Fotoğraflar" },
    { id: PROFILE_TABS.SAVED, label: "Kaydedilenler" },
  ];

  const renderActiveTab = () => {
    if (!canViewProfileContent) {
      return <LockedProfileTab type={activeTab} />;
    }

    if (activeTab === PROFILE_TABS.PHOTOS) {
      if (photosLoading) {
        return <div className="foreign-profile-tab-loading">Fotoğraflar yükleniyor...</div>;
      }

      if (photosError) {
        return (
          <div className="foreign-profile-tab-state foreign-profile-tab-state-error">
            <h3>Fotoğraflar yüklenemedi</h3>
            <p>{photosError}</p>
            <button type="button" onClick={loadPhotos}>
              Tekrar dene
            </button>
          </div>
        );
      }

      if (photos.length === 0) {
        return <EmptyProfileTab type={PROFILE_TABS.PHOTOS} />;
      }

      return (
        <div className="foreign-profile-photo-grid" aria-label="Paylaşılan fotoğraflar">
          {photos.map((photo) => (
            <button
              className="foreign-profile-photo-tile"
              type="button"
              key={photo.PlaceNotePhotoId}
              onClick={() => onOpenNote?.(Number(photo.PlaceNoteId))}
              disabled={!photo.SignedUrl || !photo.PlaceNoteId || !onOpenNote}
              title={`${photo.PlaceName || "Mekan"} notunu aç`}
            >
              <img src={photo.SignedUrl} alt={`${photo.PlaceName || "Mekan"} fotoğrafı`} />
              <span>{photo.PlaceName || "Mekan"}</span>
            </button>
          ))}
        </div>
      );
    }

    if (activeTab === PROFILE_TABS.NOTES) {
      if (notesLoading) {
        return <div className="foreign-profile-tab-loading">Notlar yükleniyor...</div>;
      }

      if (notesError) {
        return (
          <div className="foreign-profile-tab-state foreign-profile-tab-state-error">
            <h3>Notlar yüklenemedi</h3>
            <p>{notesError}</p>
            <button type="button" onClick={loadNotes}>
              Tekrar dene
            </button>
          </div>
        );
      }

      if (notes.length === 0) {
        return <EmptyProfileTab type={PROFILE_TABS.NOTES} />;
      }

      return (
        <div className="foreign-profile-note-list note-feed note-feed-profile">
          {notes.map((note, index) => (
            <ExternalNoteCard
              key={
                note?.PlaceNoteId ??
                note?.PlaceNoteID ??
                `${note?.PlaceId ?? "place"}-${note?.CreatedDate ?? index}`
              }
              note={note}
              onOpenNote={onOpenNote}
              onOpenPlace={onOpenPlace}
            />
          ))}
        </div>
      );
    }

    if (savedListsLoading) {
      return (
        <div className="foreign-profile-tab-loading">
          Kaydedilenler yükleniyor...
        </div>
      );
    }

    if (savedListsError) {
      return (
        <div className="foreign-profile-tab-state foreign-profile-tab-state-error">
          <h3>Kaydedilenler yüklenemedi</h3>
          <p>{savedListsError}</p>
          <button type="button" onClick={loadSavedLists}>
            Tekrar dene
          </button>
        </div>
      );
    }

    if (savedLists.length === 0) {
      return <EmptyProfileTab type={PROFILE_TABS.SAVED} />;
    }

    return (
      <div className="foreign-profile-saved-list">
        {savedLists.map((list) => (
          <button
            className="foreign-profile-saved-card foreign-profile-saved-card-button"
            type="button"
            key={list.UserPlaceListId}
            onClick={() =>
              onOpenPlaceList?.({
                list,
                userId: profile.UserId,
                username: profile.Username,
                isPrivate: visibilityIsPrivate,
              })
            }
            title={`${list.Name || "Mekan listesi"} listesini aç`}
          >
            <span className="foreign-profile-saved-icon" aria-hidden="true">
              {list.Icon || "✦"}
            </span>
            <span className="foreign-profile-saved-copy">
              <strong>{list.Name}</strong>
              <span>{Number(list.PlaceCount ?? 0)} mekan · Herkese açık</span>
            </span>
            <span className="foreign-profile-saved-arrow" aria-hidden="true">
              ›
            </span>
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className="discovery-page-content foreign-profile-page">
      <header className="discovery-page-header foreign-profile-page-header">
        <div>
          <h1>Profil</h1>
        </div>

        <button
          className="discovery-back-button"
          type="button"
          onClick={onBack}
          disabled={isActionLoading}
          aria-label="Geri dön"
        >
          ‹
          <span>Geri</span>
        </button>
      </header>

      <div className="discovery-page-body">
        {isLoading && (
          <div className="foreign-profile-state">Profil yükleniyor...</div>
        )}

        {!isLoading && errorMessage && !profile && (
          <div className="foreign-profile-state foreign-profile-state-error">
            <p>{t(errorMessage)}</p>
            <button type="button" onClick={() => void loadProfile()}>
              Tekrar dene
            </button>
          </div>
        )}

        {!isLoading && profile && (
          <div className="foreign-profile-content foreign-profile-content-tabs">
            <section className="foreign-profile-summary">
              <div className="foreign-profile-top">
                <div className="foreign-profile-avatar" aria-hidden="true">
                  {avatarLetter}
                </div>

                <div className="foreign-profile-identity">
                  <h2>{fullName || profile.Username}</h2>
                  <div
                    className="foreign-profile-follow-links"
                    aria-label="Profil istatistikleri"
                  >
                    <ProfileCounter
                      label="Takipçi"
                      value={profile.FollowerCount}
                      isClickable={canViewProfileContent}
                      onClick={() =>
                        onOpenCollection?.({
                          userId: profile.UserId,
                          username: profile.Username,
                          isPrivate: visibilityIsPrivate,
                          type: "followers",
                        })
                      }
                    />
                    <ProfileCounter
                      label="Takip"
                      value={profile.FollowingCount}
                      isClickable={canViewProfileContent}
                      onClick={() =>
                        onOpenCollection?.({
                          userId: profile.UserId,
                          username: profile.Username,
                          isPrivate: visibilityIsPrivate,
                          type: "following",
                        })
                      }
                    />
                  </div>
                  <div className="foreign-profile-public-details">
                    {profile.CityName && <span>⌖ {profile.CityName}</span>}
                    {profile.ZodiacSign && <span>✦ {profile.ZodiacSign}</span>}
                  </div>
                </div>
              </div>

              {visibilityIsPrivate && !canViewProfileContent && (
                <p className="foreign-profile-private-message">
                  Bu hesap gizli. Notlar, fotoğraflar ve görünür listeler,
                  takip isteğin kabul edildiğinde açılır.
                </p>
              )}

              {errorMessage && profile && (
                <p className="foreign-profile-action-error" role="alert">
                  {t(errorMessage)}
                </p>
              )}

              <button
                className={`foreign-profile-follow-button ${
                  followStatus === "ACCEPTED" ? "foreign-profile-following" : ""
                } ${
                  followStatus === "PENDING" ? "foreign-profile-pending" : ""
                }`}
                type="button"
                disabled={isActionLoading}
                onClick={handleFollowAction}
              >
                {isActionLoading ? "İşleniyor..." : followButtonLabel}
              </button>
            </section>

            <div className="foreign-profile-tab-bar" role="tablist" aria-label="Profil içeriği">
              {tabButtons.map((tab) => (
                <button
                  key={tab.id}
                  className={`foreign-profile-tab${
                    activeTab === tab.id ? " foreign-profile-tab-active" : ""
                  }`}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <section className="foreign-profile-tab-panel" role="tabpanel">
              {renderActiveTab()}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
