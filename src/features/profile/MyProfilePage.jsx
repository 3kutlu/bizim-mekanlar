/*
 * Refactored from the application root.
 * This feature module intentionally keeps existing UI behavior intact.
 */

import { MESSAGE_KEY, getErrorMessageKey, t } from "../../i18n/messages.js";
import { supabase } from "../../supabase.js";
import { createSignedNotePhotoUrls } from "../../utils/notePhotos.js";
import { createProfilePhotoDraft, deleteMyProfilePhotoObject, removeMyProfilePhotoPath, revokeProfilePhotoDraft, setMyProfilePhotoPath, uploadMyProfilePhotoDraft, useProfilePhotoUrls } from "../../utils/profilePhotos.js";
import { PROFILE_TAB_IDS, getFullName } from "../app/appShared.jsx";
import { PlaceListEditModal } from "../collections/CollectionEditorModal.jsx";
import { LoadingState, NoteFeed } from "../notes/NoteComponents.jsx";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import AppIcon, { CollectionIcon } from "../../components/AppIcon.jsx";
import { getZodiacIconName } from "../../utils/zodiac.js";

export function ProfilePage({
  profile,
  summary,
  profileNotice,
  notesRefreshKey,
  placeListsRefreshKey,
  currentUserId,
  onCollectionClick,
  onOpenPlaceList,
  onOpenPlace,
  onOpenNote,
}) {
  const [activeTab, setActiveTab] = useState(PROFILE_TAB_IDS.NOTES);
  const [profileNotes, setProfileNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(true);
  const [notesError, setNotesError] = useState("");
  const [profilePhotos, setProfilePhotos] = useState([]);
  const [photosLoading, setPhotosLoading] = useState(false);
  const [photosError, setPhotosError] = useState("");
  const [placeLists, setPlaceLists] = useState([]);
  const [listsLoading, setListsLoading] = useState(false);
  const [listsError, setListsError] = useState("");
  const [collectionEditor, setCollectionEditor] = useState(null);
  const initialContentLoadRef = useRef(null);
  const lastNotesRefreshKeyRef = useRef(notesRefreshKey);
  const lastListsRefreshKeyRef = useRef(placeListsRefreshKey);
  const swipeStartRef = useRef(null);
  const [tabDragOffset, setTabDragOffset] = useState(0);
  const [isTabDragging, setIsTabDragging] = useState(false);

  const fullName = getFullName(profile);
  const avatarLetter = (profile.Username || profile.FirstName || "K")
    .charAt(0)
    .toUpperCase();
  const profilePhotoUrls = useProfilePhotoUrls(
    [profile?.UserId],
    profile?.ProfilePhotoPath
  );
  const profilePhotoUrl = profilePhotoUrls[Number(profile?.UserId)] || "";

  const loadProfileNotes = useCallback(async () => {
    if (!profile?.UserId) {
      setProfileNotes([]);
      setNotesError("");
      setNotesLoading(false);
      return;
    }

    setNotesLoading(true);
    setNotesError("");

    const { data, error } = await supabase.rpc("GetProfileNoteCardsV2", {
      p_profile_user_id: profile.UserId,
    });

    if (error) {
      console.error("Profil notları alınamadı:", error);
      setProfileNotes([]);
      setNotesError("Notlar şu an yüklenemedi. Tekrar dene.");
    } else {
      setProfileNotes(data ?? []);
    }

    setNotesLoading(false);
  }, [profile?.UserId]);

  const loadProfilePhotos = useCallback(async () => {
    if (!profile?.UserId) {
      setProfilePhotos([]);
      setPhotosError("");
      setPhotosLoading(false);
      return;
    }

    setPhotosLoading(true);
    setPhotosError("");

    const { data, error } = await supabase.rpc("GetVisibleUserPlaceNotePhotos", {
      p_profile_user_id: Number(profile.UserId),
      p_limit: 80,
    });

    if (error) {
      console.error("Profil fotoğrafları alınamadı:", error);
      setProfilePhotos([]);
      setPhotosError("Fotoğraflar şu an yüklenemedi. Tekrar dene.");
      setPhotosLoading(false);
      return;
    }

    try {
      setProfilePhotos(await createSignedNotePhotoUrls(data ?? []));
    } catch (signedUrlError) {
      console.error("Profil fotoğraf bağlantıları oluşturulamadı:", signedUrlError);
      setProfilePhotos([]);
      setPhotosError("Fotoğraflar şu an görüntülenemedi. Tekrar dene.");
    }

    setPhotosLoading(false);
  }, [profile?.UserId]);

  const loadPlaceLists = useCallback(async () => {
    setListsLoading(true);
    setListsError("");

    const { data, error } = await supabase.rpc("GetMyPlaceListsV3");

    if (error) {
      console.error("Kişisel mekan listeleri alınamadı:", error);
      setPlaceLists([]);
      setListsError("Mekan listelerin şu an yüklenemedi. Tekrar dene.");
      setListsLoading(false);
      return;
    }

    const lists = data ?? [];

    try {
      const withSignedUrls = await createSignedNotePhotoUrls(
        lists.map((list) => ({
          ...list,
          StoragePath: list?.CoverStoragePath ?? null,
        }))
      );

      setPlaceLists(
        withSignedUrls.map(({ SignedUrl, ...list }) => ({
          ...list,
          CoverSignedUrl: SignedUrl,
        }))
      );
    } catch (signedUrlError) {
      // A cover is decorative. Keep the lists usable when just the signed URL fails.
      console.error("Koleksiyon kapak bağlantıları oluşturulamadı:", signedUrlError);
      setPlaceLists(lists);
    }

    setListsLoading(false);
  }, []);

  useEffect(() => {
    const profileId = Number(profile?.UserId);

    if (!Number.isInteger(profileId) || profileId <= 0) {
      return;
    }

    if (initialContentLoadRef.current === profileId) {
      return;
    }

    initialContentLoadRef.current = profileId;
    lastNotesRefreshKeyRef.current = notesRefreshKey;
    lastListsRefreshKeyRef.current = placeListsRefreshKey;

    void Promise.all([
      loadProfileNotes(),
      loadProfilePhotos(),
      loadPlaceLists(),
    ]);
  }, [
    loadPlaceLists,
    loadProfileNotes,
    loadProfilePhotos,
    notesRefreshKey,
    placeListsRefreshKey,
    profile?.UserId,
  ]);

  useEffect(() => {
    if (lastNotesRefreshKeyRef.current === notesRefreshKey) {
      return;
    }

    lastNotesRefreshKeyRef.current = notesRefreshKey;
    void Promise.all([loadProfileNotes(), loadProfilePhotos()]);
  }, [loadProfileNotes, loadProfilePhotos, notesRefreshKey]);

  useEffect(() => {
    if (lastListsRefreshKeyRef.current === placeListsRefreshKey) {
      return;
    }

    lastListsRefreshKeyRef.current = placeListsRefreshKey;
    void loadPlaceLists();
  }, [loadPlaceLists, placeListsRefreshKey]);

  const handleTabSwipeStart = (event) => {
    const touch = event.touches?.[0];
    if (!touch) return;

    swipeStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      width: event.currentTarget.clientWidth || 1,
      axis: null,
    };
    setTabDragOffset(0);
    setIsTabDragging(false);
  };

  const handleTabSwipeMove = (event) => {
    const start = swipeStartRef.current;
    const touch = event.touches?.[0];
    if (!start || !touch) return;

    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;

    if (!start.axis) {
      if (Math.abs(deltaX) < 6 && Math.abs(deltaY) < 6) return;
      start.axis = Math.abs(deltaX) > Math.abs(deltaY) ? "x" : "y";
    }

    if (start.axis !== "x") return;

    const tabs = [PROFILE_TAB_IDS.NOTES, PROFILE_TAB_IDS.PHOTOS, PROFILE_TAB_IDS.SAVED];
    const currentIndex = tabs.indexOf(activeTab);
    const atFirst = currentIndex === 0 && deltaX > 0;
    const atLast = currentIndex === tabs.length - 1 && deltaX < 0;
    const resistedOffset = (atFirst || atLast) ? deltaX * 0.28 : deltaX;

    event.preventDefault();
    setIsTabDragging(true);
    setTabDragOffset(resistedOffset);
  };

  const finishTabSwipe = (event, cancelled = false) => {
    const start = swipeStartRef.current;
    const touch = event.changedTouches?.[0];
    swipeStartRef.current = null;

    if (!start || !touch) {
      setTabDragOffset(0);
      setIsTabDragging(false);
      return;
    }

    const deltaX = touch.clientX - start.x;
    const tabs = [PROFILE_TAB_IDS.NOTES, PROFILE_TAB_IDS.PHOTOS, PROFILE_TAB_IDS.SAVED];
    const currentIndex = tabs.indexOf(activeTab);
    const threshold = Math.min(92, start.width * 0.22);

    if (!cancelled && start.axis === "x" && Math.abs(deltaX) >= threshold) {
      const nextIndex = deltaX < 0 ? currentIndex + 1 : currentIndex - 1;
      if (tabs[nextIndex]) setActiveTab(tabs[nextIndex]);
    }

    setTabDragOffset(0);
    setIsTabDragging(false);
  };

  const handleTabSwipeEnd = (event) => finishTabSwipe(event);
  const handleTabSwipeCancel = (event) => finishTabSwipe(event, true);

  const handlePlaceListSaved = (updatedList) => {
    const updatedListId = Number(updatedList?.UserPlaceListId);

    if (!Number.isInteger(updatedListId) || updatedListId <= 0) {
      return;
    }

    setPlaceLists((currentLists) => {
      const hasExisting = currentLists.some(
        (currentList) =>
          Number(currentList?.UserPlaceListId) === updatedListId
      );

      const nextLists = hasExisting
        ? currentLists.map((currentList) =>
            Number(currentList?.UserPlaceListId) === updatedListId
              ? { ...currentList, ...updatedList }
              : currentList
          )
        : [...currentLists, updatedList];

      return [...nextLists].sort(
        (left, right) =>
          Number(right?.UserPlaceListId ?? 0) - Number(left?.UserPlaceListId ?? 0)
      );
    });
    setCollectionEditor(null);
  };

  const handlePlaceListDeleted = (listId) => {
    const normalizedListId = Number(listId);

    setPlaceLists((currentLists) =>
      currentLists.filter(
        (currentList) =>
          Number(currentList?.UserPlaceListId) !== normalizedListId
      )
    );
    setCollectionEditor(null);
  };

  const isPrivateAccount = profile.AccountVisibilityStatusId === 2;

  return (
    <section className="profile-page page-section">
      <div className="profile-card">
        <div className="profile-top">
          <div className="profile-avatar" aria-hidden="true">
            {profilePhotoUrl ? <img src={profilePhotoUrl} alt="" /> : avatarLetter}
          </div>

          <div className="profile-identity">
            <div className="profile-identity-heading">
              <div className="profile-name-block">
                <h1>{fullName || profile.Username}</h1>
              </div>
            </div>

            <div className="profile-follow-links" aria-label="Profil istatistikleri">
              <button
                className="profile-follow-link"
                type="button"
                onClick={() => onCollectionClick("followers")}
              >
                <strong>{summary.FollowerCount}</strong>
                <span>Takipçi</span>
              </button>
              <button
                className="profile-follow-link"
                type="button"
                onClick={() => onCollectionClick("following")}
              >
                <strong>{summary.FollowingCount}</strong>
                <span>Takip</span>
              </button>
            </div>
          </div>
        </div>

        {profileNotice && (
          <p className="profile-stat-notice" role="status">
            {t(profileNotice)}
          </p>
        )}

        <div
          className="profile-public-details"
          aria-label="Herkese açık profil bilgileri"
        >
          {summary.CityName && <span><AppIcon name="map-pin" className="profile-detail-icon" />{summary.CityName}</span>}
          {profile.ZodiacSign && <span><AppIcon name={getZodiacIconName(profile.ZodiacSign)} className="profile-detail-icon" />{profile.ZodiacSign}</span>}
          {isPrivateAccount && <span><AppIcon name="eye-slash" className="profile-detail-icon" />Gizli hesap</span>}
        </div>

        <div className="profile-tabs" role="tablist" aria-label="Profil içerikleri">
          <button
            className={`profile-tab-button${
              activeTab === PROFILE_TAB_IDS.NOTES ? " profile-tab-button-active" : ""
            }`}
            type="button"
            role="tab"
            aria-selected={activeTab === PROFILE_TAB_IDS.NOTES}
            aria-controls="profile-tab-panel-notes"
            id="profile-tab-notes"
            onClick={() => setActiveTab(PROFILE_TAB_IDS.NOTES)}
          >
            <AppIcon name="pencil-simple-line" className="profile-tab-icon" />
            <span>Notlar</span>
          </button>
          <button
            className={`profile-tab-button${
              activeTab === PROFILE_TAB_IDS.PHOTOS ? " profile-tab-button-active" : ""
            }`}
            type="button"
            role="tab"
            aria-selected={activeTab === PROFILE_TAB_IDS.PHOTOS}
            aria-controls="profile-tab-panel-photos"
            id="profile-tab-photos"
            onClick={() => setActiveTab(PROFILE_TAB_IDS.PHOTOS)}
          >
            <AppIcon name="images" className="profile-tab-icon" />
            <span>Fotoğraflar</span>
          </button>
          <button
            className={`profile-tab-button${
              activeTab === PROFILE_TAB_IDS.SAVED ? " profile-tab-button-active" : ""
            }`}
            type="button"
            role="tab"
            aria-selected={activeTab === PROFILE_TAB_IDS.SAVED}
            aria-controls="profile-tab-panel-saved"
            id="profile-tab-saved"
            onClick={() => setActiveTab(PROFILE_TAB_IDS.SAVED)}
          >
            <AppIcon name="bookmarks" className="profile-tab-icon" />
            <span>Listeler</span>
          </button>
        </div>

        <div
          className="profile-tab-viewport"
          role="tabpanel"
          aria-labelledby={`profile-tab-${activeTab}`}
          onTouchStart={handleTabSwipeStart}
          onTouchMove={handleTabSwipeMove}
          onTouchEnd={handleTabSwipeEnd}
          onTouchCancel={handleTabSwipeCancel}
        >
          <div
            className={`profile-tab-track${isTabDragging ? " profile-tab-track-dragging" : ""}`}
            style={{ transform: `translate3d(calc(-${[PROFILE_TAB_IDS.NOTES, PROFILE_TAB_IDS.PHOTOS, PROFILE_TAB_IDS.SAVED].indexOf(activeTab) * 100}% + ${tabDragOffset}px), 0, 0)` }}
          >
            <section className="profile-tab-panel" id="profile-tab-panel-notes">
              <ProfileNotesTab
                notes={profileNotes}
                loading={notesLoading}
                errorMessage={notesError}
                currentUserId={currentUserId}
                onRetry={loadProfileNotes}
                onOpenPlace={onOpenPlace}
                onOpenNote={onOpenNote}
              />
            </section>

            <section className="profile-tab-panel" id="profile-tab-panel-photos">
              <ProfilePhotosTab
                photos={profilePhotos}
                loading={photosLoading}
                errorMessage={photosError}
                onRetry={loadProfilePhotos}
                onOpenNote={onOpenNote}
              />
            </section>

            <section className="profile-tab-panel" id="profile-tab-panel-saved">
              <ProfileSavedTab
                lists={placeLists}
                loading={listsLoading}
                errorMessage={listsError}
                accountIsPrivate={isPrivateAccount}
                onRetry={loadPlaceLists}
                onOpenList={(list) =>
                  onOpenPlaceList?.({
                    list,
                    userId: profile.UserId,
                    username: profile.Username,
                  })
                }
                onCreateList={() =>
                  setCollectionEditor({ mode: "create", list: null })
                }
                onEditList={(list) =>
                  setCollectionEditor({ mode: "edit", list })
                }
              />
            </section>
          </div>
        </div>
      </div>

      {collectionEditor &&
        createPortal(
          <PlaceListEditModal
            list={collectionEditor.list}
            mode={collectionEditor.mode}
            onClose={() => setCollectionEditor(null)}
            onSaved={handlePlaceListSaved}
            onDeleted={handlePlaceListDeleted}
          />,
          document.body
        )}
    </section>
  );
}

export function ProfileNotesTab({
  notes,
  loading,
  errorMessage,
  currentUserId,
  onRetry,
  onOpenPlace,
  onOpenNote,
}) {
  if (loading) {
    return <LoadingState compact />;
  }

  if (errorMessage) {
    return (
      <div className="profile-tab-error">
        <p>{errorMessage}</p>
        <button type="button" onClick={onRetry}>
          Tekrar dene
        </button>
      </div>
    );
  }

  if (notes.length === 0) {
    return (
      <div className="profile-tab-empty-state">
        <span className="profile-tab-empty-icon" aria-hidden="true"><AppIcon name="bookmark" /></span>
        <h2>Henüz not yok</h2>
        <p>İlk mekan notunu eklediğinde burada görünecek.</p>
      </div>
    );
  }

  return (
    <NoteFeed
      notes={notes}
      variant="profile"
      currentUserId={currentUserId}
      onOpenPlace={onOpenPlace}
      onOpenNote={onOpenNote}
    />
  );
}

export function ProfilePhotosTab({ photos, loading, errorMessage, onRetry, onOpenNote }) {
  if (loading) {
    return <LoadingState compact />;
  }

  if (errorMessage) {
    return (
      <div className="profile-tab-error">
        <p>{errorMessage}</p>
        <button type="button" onClick={onRetry}>
          Tekrar dene
        </button>
      </div>
    );
  }

  if (photos.length === 0) {
    return (
      <div className="profile-tab-empty-state profile-photo-empty-state">
        <span className="profile-tab-empty-icon" aria-hidden="true"><AppIcon name="images" /></span>
        <h2>Henüz fotoğraf yok</h2>
        <p>Notlarına fotoğraf eklediğinde burada bir galeri olarak göreceksin.</p>
      </div>
    );
  }

  return (
    <div className="profile-photo-grid" aria-label="Paylaşılan fotoğraflar">
      {photos.map((photo) => (
        <button
          className="profile-photo-tile"
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

export function ProfileSavedTab({
  lists,
  loading,
  errorMessage,
  accountIsPrivate,
  onRetry,
  onOpenList,
  onCreateList,
  onEditList,
}) {
  if (loading) {
    return <LoadingState compact />;
  }

  if (errorMessage) {
    return (
      <div className="profile-tab-error">
        <p>{errorMessage}</p>
        <button type="button" onClick={onRetry}>
          Tekrar dene
        </button>
      </div>
    );
  }

  if (lists.length === 0) {
    return (
      <div className="profile-tab-empty-state">
        <span className="profile-tab-empty-icon" aria-hidden="true"><AppIcon name="bookmarks" /></span>
        <h2>Henüz mekan listen yok</h2>
        <p>Hazır listelerine mekan kaydedebilir veya kendi koleksiyonunu oluşturabilirsin.</p>
        <button className="profile-new-collection-button" type="button" onClick={onCreateList}>
          Yeni koleksiyon
        </button>
      </div>
    );
  }

  return (
    <div className="profile-saved-list" aria-label="Mekan listelerin">
      <button className="profile-new-collection-button" type="button" onClick={onCreateList}>
        <AppIcon name="plus" className="profile-new-collection-icon" />
        Yeni koleksiyon
      </button>
      {lists.map((list) => {
        const isPublic = String(list?.VisibilityCode ?? "PRIVATE")
          .trim()
          .toUpperCase() === "PUBLIC";
        const placeCount = Math.max(0, Number(list?.PlaceCount) || 0);

        return (
          <article className="profile-saved-list-card" key={list.UserPlaceListId}>
            <button
              className="profile-saved-list-main"
              type="button"
              onClick={() => onOpenList?.(list)}
              title={`${list.Name || "Mekan listesi"} listesini aç`}
            >
              {list.CoverSignedUrl ? (
                <img
                  className="profile-saved-list-cover"
                  src={list.CoverSignedUrl}
                  alt=""
                />
              ) : (
                <span className="profile-saved-list-icon" aria-hidden="true">
                  <CollectionIcon value={list.Icon} />
                </span>
              )}

              <span className="profile-saved-list-copy">
                <strong>{list.Name}</strong>
                {list.Description && <em>{list.Description}</em>}
                <span>{placeCount} mekan</span>
              </span>
            </button>

            <span
              className={`profile-list-visibility-badge${
                isPublic ? " profile-list-visibility-badge-public" : ""
              }`}
            >
              {isPublic ? "Herkese açık" : "Gizli"}
            </span>

            <button
              className="profile-list-more-button"
              type="button"
              onClick={() => onEditList?.(list)}
              aria-label={`${list.Name || "Mekan listesi"} listesini düzenle`}
              title="Listeyi düzenle"
            >
              <AppIcon name="dots-three" className="profile-list-more-icon" />
            </button>
          </article>
        );
      })}

      {accountIsPrivate && (
        <p className="profile-list-privacy-note">
          Hesabın gizli olduğu için, herkese açık listelerin yalnızca kabul
          ettiğin takipçilere görünür.
        </p>
      )}
    </div>
  );
}

export function ProfileEditModal({
  profile,
  cities,
  citiesLoading,
  citiesError,
  onClose,
  onSaved,
  onLogout,
}) {
  const [form, setForm] = useState({
    username: profile.Username ?? "",
    firstName: profile.FirstName ?? "",
    lastName: profile.LastName ?? "",
    birthDate: profile.BirthDate ?? "",
    cityId: String(profile.CityId ?? ""),
    isPrivateAccount: profile.AccountVisibilityStatusId === 2,
  });
  const [usernameMessage, setUsernameMessage] = useState("");
  const [usernameAvailable, setUsernameAvailable] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [photoDraft, setPhotoDraft] = useState(null);
  const [removeCurrentPhoto, setRemoveCurrentPhoto] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const photoInputRef = useRef(null);
  const profilePhotoUrls = useProfilePhotoUrls(
    [profile?.UserId],
    profile?.ProfilePhotoPath
  );
  const currentProfilePhotoUrl = profilePhotoUrls[Number(profile?.UserId)] || "";
  const hasCurrentProfilePhoto = Boolean(profile?.ProfilePhotoPath);
  const displayedProfilePhotoUrl = photoDraft?.previewUrl || (
    removeCurrentPhoto ? "" : currentProfilePhotoUrl
  );
  const avatarLetter = (profile?.Username || profile?.FirstName || "K")
    .charAt(0)
    .toUpperCase();

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === "Escape" && !saving && !loggingOut) {
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
  }, [loggingOut, onClose, saving]);

  useEffect(() => {
    return () => revokeProfilePhotoDraft(photoDraft);
  }, [photoDraft]);

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));

    if (field === "username") {
      setUsernameAvailable(null);
      setUsernameMessage("");
    }
  };

  const checkUsername = async () => {
    const normalizedUsername = form.username.trim().toLowerCase();

    if (normalizedUsername === profile.Username) {
      setUsernameAvailable(true);
      setUsernameMessage(MESSAGE_KEY.USERNAME_CURRENT);
      return true;
    }

    if (!/^[a-z0-9._]{3,30}$/.test(normalizedUsername)) {
      setUsernameAvailable(false);
      setUsernameMessage(MESSAGE_KEY.USERNAME_INVALID_FORMAT);
      return false;
    }

    const { data, error } = await supabase.rpc("IsUsernameAvailable", {
      p_username: normalizedUsername,
    });

    if (error) {
      console.error("Kullanıcı adı kontrolü yapılamadı:", error);
      setUsernameAvailable(null);
      setUsernameMessage(MESSAGE_KEY.USERNAME_CHECK_FAILED);
      return false;
    }

    const isAvailable = Boolean(data);
    setUsernameAvailable(isAvailable);
    setUsernameMessage(
      isAvailable ? MESSAGE_KEY.USERNAME_AVAILABLE : MESSAGE_KEY.USERNAME_TAKEN
    );

    return isAvailable;
  };

  const handleProfilePhotoSelected = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file || saving || loggingOut) {
      return;
    }

    setPhotoError("");

    try {
      const nextDraft = createProfilePhotoDraft(file);
      setPhotoDraft(nextDraft);
      setRemoveCurrentPhoto(false);
    } catch (error) {
      console.error("Profil fotoğrafı hazırlanamadı:", error);
      setPhotoError(error?.message || "Profil fotoğrafı seçilemedi.");
    }
  };

  const markProfilePhotoForRemoval = () => {
    if (saving || loggingOut) {
      return;
    }

    setPhotoDraft(null);
    setRemoveCurrentPhoto(true);
    setPhotoError("");
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    setSaveError("");

    if (!form.firstName.trim()) {
      setSaveError(MESSAGE_KEY.PROFILE_FIRST_NAME_REQUIRED);
      return;
    }

    if (!form.birthDate) {
      setSaveError(MESSAGE_KEY.PROFILE_BIRTH_DATE_REQUIRED);
      return;
    }

    if (!form.cityId) {
      setSaveError(MESSAGE_KEY.PROFILE_CITY_REQUIRED);
      return;
    }

    const usernameIsValid = await checkUsername();

    if (!usernameIsValid) {
      setSaveError(MESSAGE_KEY.PROFILE_USERNAME_MUST_BE_AVAILABLE);
      return;
    }

    setSaving(true);

    const { error } = await supabase.rpc("UpdateMyProfile", {
      p_username: form.username.trim().toLowerCase(),
      p_first_name: form.firstName.trim(),
      p_last_name: form.lastName.trim() || null,
      p_birth_date: form.birthDate,
      p_city_id: Number(form.cityId),
      p_account_visibility_code: form.isPrivateAccount
        ? "PRIVATE"
        : "PUBLIC",
    });

    if (error) {
      console.error("Profil güncellenemedi:", error);
      setSaveError(
        getErrorMessageKey(error, MESSAGE_KEY.PROFILE_UPDATE_FAILED)
      );
      setSaving(false);
      return;
    }

    try {
      if (photoDraft) {
        const uploadedPhoto = await uploadMyProfilePhotoDraft(photoDraft);
        let previousStoragePath = "";

        try {
          previousStoragePath = await setMyProfilePhotoPath(
            uploadedPhoto.storagePath
          );
        } catch (photoPathError) {
          await deleteMyProfilePhotoObject(uploadedPhoto.storagePath).catch(
            (cleanupError) => {
              console.error("Yüklenemeyen profil fotoğrafı temizlenemedi:", cleanupError);
            }
          );
          throw photoPathError;
        }

        if (
          previousStoragePath &&
          previousStoragePath !== uploadedPhoto.storagePath
        ) {
          await deleteMyProfilePhotoObject(previousStoragePath).catch(
            (cleanupError) => {
              console.error("Eski profil fotoğrafı temizlenemedi:", cleanupError);
            }
          );
        }
      } else if (removeCurrentPhoto && hasCurrentProfilePhoto) {
        const previousStoragePath = await removeMyProfilePhotoPath();

        if (previousStoragePath) {
          await deleteMyProfilePhotoObject(previousStoragePath).catch(
            (cleanupError) => {
              console.error("Profil fotoğrafı temizlenemedi:", cleanupError);
            }
          );
        }
      }
    } catch (photoUpdateError) {
      console.error("Profil fotoğrafı güncellenemedi:", photoUpdateError);
      setPhotoError(
        "Profil bilgilerin kaydedildi, ancak fotoğrafın güncellenemedi. Tekrar deneyebilirsin."
      );
      setSaving(false);
      return;
    }

    await onSaved();
  };

  const handleLogout = async () => {
    if (saving || loggingOut || !onLogout) {
      return;
    }

    setLogoutError("");
    setLoggingOut(true);

    try {
      const didSignOut = await onLogout();

      if (!didSignOut) {
        setLogoutError(MESSAGE_KEY.SIGN_OUT_FAILED);
      }
    } catch (error) {
      console.error("Çıkış yapılamadı:", error);
      setLogoutError(MESSAGE_KEY.SIGN_OUT_FAILED);
    } finally {
      setLoggingOut(false);
    }
  };

  const handleBackdropMouseDown = (event) => {
    if (!saving && !loggingOut && event.target === event.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="profile-modal-backdrop"
      role="presentation"
      onMouseDown={handleBackdropMouseDown}
    >
      <section
        className="profile-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-modal-title"
      >
        <div className="profile-modal-header">
          <div>
            <p className="eyebrow">HESABIN</p>
            <h2 id="profile-modal-title">Profili düzenle</h2>
          </div>
          <button
            className="profile-modal-close"
            type="button"
            onClick={onClose}
            disabled={saving || loggingOut}
            aria-label="Kapat"
          >
            <AppIcon name="x" />
          </button>
        </div>

        <form className="profile-edit-form" onSubmit={saveProfile}>
          <div className="profile-photo-editor">
            <div className="profile-photo-editor-preview" aria-hidden="true">
              {displayedProfilePhotoUrl ? (
                <img src={displayedProfilePhotoUrl} alt="" />
              ) : (
                avatarLetter
              )}
            </div>

            <div className="profile-photo-editor-copy">
              <strong>Profil fotoğrafı</strong>
              <span>JPG, PNG veya WEBP · en fazla 5 MB</span>

              <div className="profile-photo-editor-actions">
                <button
                  className="profile-photo-editor-select"
                  type="button"
                  disabled={saving || loggingOut}
                  onClick={() => photoInputRef.current?.click()}
                >
                  {displayedProfilePhotoUrl ? "Fotoğrafı değiştir" : "Fotoğraf ekle"}
                </button>

                {(hasCurrentProfilePhoto || photoDraft) && !removeCurrentPhoto && (
                  <button
                    className="profile-photo-editor-remove"
                    type="button"
                    disabled={saving || loggingOut}
                    onClick={markProfilePhotoForRemoval}
                  >
                    Fotoğrafı kaldır
                  </button>
                )}
              </div>
            </div>

            <input
              ref={photoInputRef}
              className="profile-photo-editor-input"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={saving || loggingOut}
              onChange={handleProfilePhotoSelected}
            />

            {photoError && (
              <p className="profile-photo-editor-error" role="alert">
                {photoError}
              </p>
            )}
          </div>

          <label>
            Kullanıcı adı
            <input
              type="text"
              value={form.username}
              minLength="3"
              maxLength="30"
              autoComplete="username"
              disabled={saving}
              onBlur={checkUsername}
              onChange={(event) =>
                updateField("username", event.target.value.toLowerCase())
              }
            />
          </label>

          {usernameMessage && (
            <p
              className={`profile-field-message ${
                usernameAvailable === false ? "profile-field-error" : ""
              }`}
            >
              {t(usernameMessage)}
            </p>
          )}

          <div className="profile-edit-row">
            <label>
              İsim
              <input
                type="text"
                value={form.firstName}
                autoComplete="given-name"
                disabled={saving}
                onChange={(event) =>
                  updateField("firstName", event.target.value)
                }
              />
            </label>

            <label>
              Soyisim <span>(opsiyonel)</span>
              <input
                type="text"
                value={form.lastName}
                autoComplete="family-name"
                disabled={saving}
                onChange={(event) =>
                  updateField("lastName", event.target.value)
                }
              />
            </label>
          </div>

          <div className="profile-edit-row">
            <label>
              Doğum tarihi
              <input
                type="date"
                value={form.birthDate}
                disabled={saving}
                onChange={(event) =>
                  updateField("birthDate", event.target.value)
                }
              />
            </label>

            <label>
              Şehir
              <select
                value={form.cityId}
                disabled={saving || citiesLoading}
                onChange={(event) => updateField("cityId", event.target.value)}
              >
                <option value="">
                  {citiesLoading ? "Yükleniyor..." : "Şehir seç"}
                </option>
                {cities.map((city) => (
                  <option key={city.CityId} value={city.CityId}>
                    {String(city.PlateCode).padStart(2, "0")} · {city.Name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label>
            E-posta
            <input type="email" value={profile.Email ?? ""} disabled />
            <small>E-posta adresin şu an Supabase hesabından yönetiliyor.</small>
          </label>


          <label className="profile-privacy-toggle">
            <input
              type="checkbox"
              checked={form.isPrivateAccount}
              disabled={saving}
              onChange={(event) =>
                updateField("isPrivateAccount", event.target.checked)
              }
            />

            <span className="profile-privacy-copy">
              <strong>Gizli hesap</strong>
              <small>
                {form.isPrivateAccount
                  ? "Notların ve takip listelerin yalnızca kabul ettiğin takipçilere görünür."
                  : profile.AccountVisibilityStatusId === 2
                    ? "Hesabını herkese açık yaptığında bekleyen takip istekleri de kabul edilir."
                    : "Profilin, notların ve takip listelerin herkese açık olur."}
              </small>
            </span>

            <span className="profile-privacy-switch" aria-hidden="true">
              <span />
            </span>
          </label>

          {citiesError && (
            <p className="profile-save-error">{t(citiesError)}</p>
          )}
          {saveError && (
            <p className="profile-save-error">{t(saveError)}</p>
          )}

          <div className="profile-modal-actions">
            <button
              className="profile-modal-cancel"
              type="button"
              onClick={onClose}
              disabled={saving || loggingOut}
            >
              Vazgeç
            </button>
            <button
              className="profile-modal-save"
              type="submit"
              disabled={saving || loggingOut || citiesLoading}
            >
              {saving ? "Kaydediliyor..." : "Kaydet"}
            </button>
          </div>

          <div className="profile-modal-logout-section">
            <button
              className="profile-modal-logout"
              type="button"
              onClick={handleLogout}
              disabled={saving || loggingOut}
            >
              {loggingOut ? "Çıkış yapılıyor..." : "Çıkış yap"}
            </button>

            {logoutError && (
              <p className="profile-modal-logout-error" role="alert">
                {t(logoutError)}
              </p>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}
