import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase.js";
import AuthPage from "./AuthPage.jsx";
import MapPage from "./pages/MapPage.jsx";
import UserSearchPage from "./pages/UserSearchPage.jsx";
import UserProfilePage from "./pages/UserProfilePage.jsx";
import "./css/app-shell.css";
import "./css/list-page.css";
import "./css/profile-page.css";
import "./css/user-discovery.css";

const EMPTY_SUMMARY = {
  CityName: "",
  FollowerCount: 0,
  FollowingCount: 0,
  NoteCount: 0,
};

const PROFILE_COLLECTIONS = {
  notes: {
    title: "Notlar",
    emptyMessage: "Henüz not bulunmuyor.",
  },
  followers: {
    title: "Takipçiler",
    emptyMessage: "Henüz takipçi bulunmuyor.",
  },
  following: {
    title: "Takip edilenler",
    emptyMessage: "Henüz takip edilen hesap bulunmuyor.",
  },
};

function formatDate(value, options = { day: "numeric", month: "long", year: "numeric" }) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("tr-TR", options).format(date);
}

function getFullName(user) {
  return [user?.FirstName, user?.LastName].filter(Boolean).join(" ");
}

function createDiscoveryScreenId(type) {
  return `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function App() {
  const [session, setSession] = useState(null);
  const [activePage, setActivePage] = useState("map");
  const [loading, setLoading] = useState(true);

  const [profile, setProfile] = useState(null);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [appMessage, setAppMessage] = useState("");

  const [isProfileEditOpen, setIsProfileEditOpen] = useState(false);
  const [profileNotice, setProfileNotice] = useState("");
  const [notesRefreshKey, setNotesRefreshKey] = useState(0);
  const [mapTarget, setMapTarget] = useState(null);
  const [discoveryStack, setDiscoveryStack] = useState([]);

  const [cities, setCities] = useState([]);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [citiesError, setCitiesError] = useState("");


  const pushDiscoveryScreen = useCallback((screen) => {
    setDiscoveryStack((currentStack) => [
      ...currentStack,
      {
        id: createDiscoveryScreenId(screen.type),
        ...screen,
      },
    ]);
  }, []);

  const popDiscoveryScreen = useCallback(() => {
    setDiscoveryStack((currentStack) => currentStack.slice(0, -1));
  }, []);

  const closeDiscovery = useCallback(() => {
    setDiscoveryStack([]);
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadSession = async () => {
      const { data, error } = await supabase.auth.getSession();

      if (!isMounted) {
        return;
      }

      if (error) {
        console.error("Oturum alınamadı:", error);
        setAppMessage(error.message);
      }

      setSession(data.session);
      setLoading(false);
    };

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      if (!isMounted) {
        return;
      }

      setSession(currentSession);
      setLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!profileNotice) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setProfileNotice("");
    }, 3600);

    return () => window.clearTimeout(timer);
  }, [profileNotice]);

  const loadSummary = useCallback(async (userId) => {
    if (!userId) {
      setSummary(EMPTY_SUMMARY);
      return;
    }

    const { data: summaryRows, error: summaryError } = await supabase.rpc(
      "GetUserProfileSummary",
      { p_user_id: userId }
    );

    if (summaryError) {
      console.error("Profil özeti alınamadı:", summaryError);
      setSummary(EMPTY_SUMMARY);
      return;
    }

    const summaryData = Array.isArray(summaryRows)
      ? summaryRows[0]
      : summaryRows;

    setSummary({
      CityName: summaryData?.CityName ?? "",
      FollowerCount: Number(summaryData?.FollowerCount ?? 0),
      FollowingCount: Number(summaryData?.FollowingCount ?? 0),
      NoteCount: Number(summaryData?.NoteCount ?? 0),
    });
  }, []);

  const loadProfile = useCallback(async () => {
    if (!session?.user?.id) {
      setProfile(null);
      setSummary(EMPTY_SUMMARY);
      setProfileError("");
      setProfileLoading(false);
      return;
    }

    setProfileLoading(true);
    setProfileError("");

    const { data: profileData, error: profileQueryError } = await supabase
      .from("Users")
      .select(
        "UserId, Username, FirstName, LastName, BirthDate, ZodiacSign, Email, CityId, IsActive"
      )
      .eq("AuthUserId", session.user.id)
      .eq("IsActive", true)
      .maybeSingle();

    if (profileQueryError) {
      console.error("Profil alınamadı:", profileQueryError);
      setProfile(null);
      setSummary(EMPTY_SUMMARY);
      setProfileError("Profil bilgilerin yüklenemedi.");
      setProfileLoading(false);
      return;
    }

    if (!profileData) {
      setProfile(null);
      setSummary(EMPTY_SUMMARY);
      setProfileError(
        "Hesabın oluşturuldu fakat profil kaydın bulunamadı. Lütfen yeniden giriş yapmayı dene."
      );
      setProfileLoading(false);
      return;
    }

    setProfile(profileData);
    await loadSummary(profileData.UserId);
    setProfileLoading(false);
  }, [loadSummary, session?.user?.id]);

  const refreshProfileSummary = useCallback(async () => {
    await loadSummary(profile?.UserId);
  }, [loadSummary, profile?.UserId]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const loadCities = async () => {
    if (cities.length > 0 || citiesLoading) {
      return;
    }

    setCitiesLoading(true);
    setCitiesError("");

    const { data, error } = await supabase
      .from("Cities")
      .select("CityId, PlateCode, Name")
      .eq("IsActive", true)
      .order("PlateCode");

    if (error) {
      console.error("Şehirler alınamadı:", error);
      setCitiesError("Şehir listesi yüklenemedi.");
    } else {
      setCities(data ?? []);
    }

    setCitiesLoading(false);
  };

  const openProfileEditor = () => {
    setIsProfileEditOpen(true);
    loadCities();
  };

  const handleNoteCreated = async () => {
    await refreshProfileSummary();
    setNotesRefreshKey((currentKey) => currentKey + 1);
  };

  const handleFollowChanged = async () => {
    await refreshProfileSummary();
    setNotesRefreshKey((currentKey) => currentKey + 1);
  };

  const clearMapTarget = useCallback(() => {
    setMapTarget(null);
  }, []);

  const handleOpenPlaceOnMap = useCallback(async (placeId) => {
    const normalizedPlaceId = Number(placeId);

    if (!Number.isInteger(normalizedPlaceId) || normalizedPlaceId <= 0) {
      setAppMessage("Mekan konumu açılamadı.");
      return;
    }

    const { data, error } = await supabase.rpc("GetPlaceMapTarget", {
      p_place_id: normalizedPlaceId,
    });

    if (error) {
      console.error("Mekan konumu alınamadı:", error);
      setAppMessage(error.message || "Mekan konumu şu an açılamadı.");
      return;
    }

    const place = Array.isArray(data) ? data[0] : data;
    const latitude = Number(place?.Latitude);
    const longitude = Number(place?.Longitude);

    if (!place || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      setAppMessage("Mekan konum bilgisi geçersiz.");
      return;
    }

    setMapTarget({
      requestId: `${place.PlaceId}-${Date.now()}`,
      placeId: place.PlaceId,
      id: place.GooglePlaceId,
      name: place.Name,
      address: place.FormattedAddress,
      cityName: place.CityName,
      postalCode: place.PostalCode,
      location: {
        lat: latitude,
        lng: longitude,
      },
    });

    closeDiscovery();
    setActivePage("map");
  }, [closeDiscovery]);

  const ownUserId = profile?.UserId ?? null;

  const handleTabNavigation = useCallback(
    (page) => {
      closeDiscovery();
      setActivePage(page);
    },
    [closeDiscovery]
  );

  const openUserSearch = useCallback(() => {
    setDiscoveryStack([
      {
        id: createDiscoveryScreenId("search"),
        type: "search",
      },
    ]);
  }, []);

  const handleOpenUserProfile = useCallback(
    (userId) => {
      const normalizedUserId = Number(userId);

      if (!Number.isInteger(normalizedUserId) || normalizedUserId <= 0) {
        return;
      }

      if (normalizedUserId === ownUserId) {
        closeDiscovery();
        setActivePage("profile");
        return;
      }

      pushDiscoveryScreen({
        type: "profile",
        userId: normalizedUserId,
      });
    },
    [closeDiscovery, ownUserId, pushDiscoveryScreen]
  );

  const handleOpenCollectionForUser = useCallback(
    (context) => {
      if (!context?.userId || !context?.username || !context?.type) {
        return;
      }

      pushDiscoveryScreen({
        type: "collection",
        userId: Number(context.userId),
        username: context.username,
        collectionType: context.type,
      });
    },
    [pushDiscoveryScreen]
  );

  const handleProfileCollectionClick = (type) => {
    const config = PROFILE_COLLECTIONS[type];

    if (!config) {
      return;
    }

    const countByType = {
      notes: summary.NoteCount,
      followers: summary.FollowerCount,
      following: summary.FollowingCount,
    };

    if (Number(countByType[type] ?? 0) === 0) {
      setProfileNotice(config.emptyMessage);
      return;
    }

    setProfileNotice("");
    handleOpenCollectionForUser({
      userId: profile.UserId,
      username: profile.Username,
      type,
    });
  };

  const handleLogout = async () => {
    setAppMessage("");

    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error("Çıkış yapılamadı:", error);
      setAppMessage(error.message);
      return;
    }

    closeDiscovery();
    setActivePage("map");
    setProfile(null);
    setSummary(EMPTY_SUMMARY);
  };

  if (loading || (session?.user && profileLoading)) {
    return <main className="loading-screen">Yükleniyor...</main>;
  }

  if (!session?.user) {
    return <AuthPage />;
  }

  if (profileError || !profile) {
    return (
      <main className="loading-screen">
        <section className="page-section">
          <div className="empty-state">
            <div className="empty-icon">!</div>
            <h2>Profil yüklenemedi</h2>
            <p>{profileError || "Bir hata oluştu."}</p>
            <button
              className="secondary-button"
              type="button"
              onClick={handleLogout}
            >
              Çıkış yap
            </button>
          </div>
        </section>
      </main>
    );
  }

  const activeDiscoveryScreenId =
    discoveryStack.length > 0
      ? discoveryStack[discoveryStack.length - 1].id
      : null;

  return (
    <div
      className={`app-shell${
        discoveryStack.length > 0 ? " app-shell-with-discovery" : ""
      }`}
    >
      <header className="topbar">
        <button
          className="logo-button"
          type="button"
          onClick={() => handleTabNavigation("map")}
        >
          Bizim Mekanlar
        </button>

        <div className="topbar-actions">
          <nav className="desktop-nav" aria-label="Ana menü">
            <button
              type="button"
              className={activePage === "map" ? "nav-active" : ""}
              onClick={() => handleTabNavigation("map")}
            >
              Harita
            </button>
            <button
              type="button"
              className={activePage === "list" ? "nav-active" : ""}
              onClick={() => handleTabNavigation("list")}
            >
              Liste
            </button>
            <button
              type="button"
              className={activePage === "profile" ? "nav-active" : ""}
              onClick={() => handleTabNavigation("profile")}
            >
              Profil
            </button>
          </nav>

          <button
            className="user-search-trigger"
            type="button"
            onClick={openUserSearch}
            aria-label="Kullanıcı ara"
            title="Kullanıcı ara"
          >
            ⌕
          </button>
        </div>
      </header>

      {appMessage && (
        <div className="app-message" role="status">
          {appMessage}
        </div>
      )}

      <main className="page-content">
        <section
          className={`tab-page tab-page-map ${
            activePage === "map" ? "tab-page-active" : ""
          }`}
          aria-hidden={activePage !== "map"}
        >
          <MapPage
            onNoteCreated={handleNoteCreated}
            focusPlace={mapTarget}
            onFocusHandled={clearMapTarget}
          />
        </section>

        <section
          className={`tab-page tab-page-scroll ${
            activePage === "list" ? "tab-page-active" : ""
          }`}
          aria-hidden={activePage !== "list"}
        >
          <ListPage
            refreshKey={notesRefreshKey}
            onOpenPlace={handleOpenPlaceOnMap}
            onOpenUser={handleOpenUserProfile}
          />
        </section>

        <section
          className={`tab-page tab-page-scroll ${
            activePage === "profile" ? "tab-page-active" : ""
          }`}
          aria-hidden={activePage !== "profile"}
        >
          <ProfilePage
            profile={profile}
            summary={summary}
            profileNotice={profileNotice}
            onCollectionClick={handleProfileCollectionClick}
            onEdit={openProfileEditor}
            onLogout={handleLogout}
          />
        </section>

        {discoveryStack.length > 0 && (
          <div className="discovery-page-layer">
            {discoveryStack.map((screen) => {
              const isActive = screen.id === activeDiscoveryScreenId;

              return (
                <section
                  className={`discovery-screen${
                    isActive ? " discovery-screen-active" : ""
                  }`}
                  key={screen.id}
                  aria-hidden={!isActive}
                >
                  {screen.type === "search" && (
                    <UserSearchPage
                      isActive={isActive}
                      onBack={popDiscoveryScreen}
                      onSelectUser={handleOpenUserProfile}
                    />
                  )}

                  {screen.type === "profile" && (
                    <UserProfilePage
                      userId={screen.userId}
                      isActive={isActive}
                      onBack={popDiscoveryScreen}
                      onOpenCollection={handleOpenCollectionForUser}
                      onFollowChanged={handleFollowChanged}
                    />
                  )}

                  {screen.type === "collection" && (
                    <ProfileCollectionPage
                      profileUserId={screen.userId}
                      profileUsername={screen.username}
                      type={screen.collectionType}
                      isActive={isActive}
                      onBack={popDiscoveryScreen}
                      onOpenPlace={handleOpenPlaceOnMap}
                      onOpenUser={handleOpenUserProfile}
                    />
                  )}
                </section>
              );
            })}
          </div>
        )}
      </main>

      <nav className="bottom-nav" aria-label="Alt menü">
        <button
          type="button"
          className={activePage === "map" ? "bottom-nav-active" : ""}
          onClick={() => handleTabNavigation("map")}
        >
          <span>⌖</span>
          Harita
        </button>
        <button
          type="button"
          className={activePage === "list" ? "bottom-nav-active" : ""}
          onClick={() => handleTabNavigation("list")}
        >
          <span>☷</span>
          Liste
        </button>
        <button
          type="button"
          className={activePage === "profile" ? "bottom-nav-active" : ""}
          onClick={() => handleTabNavigation("profile")}
        >
          <span>◉</span>
          Profil
        </button>
      </nav>

      {isProfileEditOpen && (
        <ProfileEditModal
          profile={profile}
          cities={cities}
          citiesLoading={citiesLoading}
          citiesError={citiesError}
          onClose={() => setIsProfileEditOpen(false)}
          onSaved={async () => {
            await loadProfile();
            setIsProfileEditOpen(false);
          }}
        />
      )}
    </div>
  );
}



function ListPage({ refreshKey, onOpenPlace, onOpenUser }) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const loadNotes = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");

    const { data, error } = await supabase.rpc("GetFollowingFeedNotes");

    if (error) {
      console.error("Akış notları alınamadı:", error);
      setNotes([]);
      setErrorMessage("Akış şu an yüklenemedi. Tekrar dene.");
    } else {
      setNotes(data ?? []);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    loadNotes();
  }, [loadNotes, refreshKey]);

  return (
    <section className="list-page page-section">
      <div className="page-heading list-page-heading">
        <p className="eyebrow">AKIŞ</p>
        <h1>Takip ettiklerin</h1>
        <p>Senin ve takip ettiğin kişilerin en yeni notları burada.</p>
      </div>

      {loading && <LoadingState />}

      {!loading && errorMessage && (
        <ErrorState message={errorMessage} onRetry={loadNotes} />
      )}

      {!loading && !errorMessage && notes.length === 0 && (
        <EmptyCollectionState
          icon="✦"
          title="Akışta henüz not yok"
          message="Sen veya takip ettiğin kişiler not eklediğinde burada göreceksin."
        />
      )}

      {!loading && !errorMessage && notes.length > 0 && (
        <NoteFeed
          notes={notes}
          onOpenPlace={onOpenPlace}
          onOpenUser={onOpenUser}
        />
      )}
    </section>
  );
}

function ProfilePage({
  profile,
  summary,
  profileNotice,
  onCollectionClick,
  onEdit,
  onLogout,
}) {
  const fullName = getFullName(profile);
  const avatarLetter = (profile.Username || profile.FirstName || "K")
    .charAt(0)
    .toUpperCase();

  return (
    <section className="profile-page page-section">
      <div className="profile-card">
        <div className="profile-top">
          <div className="profile-avatar" aria-hidden="true">
            {avatarLetter}
          </div>

          <div className="profile-identity">
            <p className="eyebrow">{profile.Username}</p>
            <h1>{fullName || profile.Username}</h1>
          </div>
        </div>

        <div className="profile-stats" aria-label="Profil istatistikleri">
          <button
            className="profile-stat-button"
            type="button"
            onClick={() => onCollectionClick("notes")}
          >
            <strong>{summary.NoteCount}</strong>
            <span>Not</span>
          </button>
          <button
            className="profile-stat-button"
            type="button"
            onClick={() => onCollectionClick("followers")}
          >
            <strong>{summary.FollowerCount}</strong>
            <span>Takipçi</span>
          </button>
          <button
            className="profile-stat-button"
            type="button"
            onClick={() => onCollectionClick("following")}
          >
            <strong>{summary.FollowingCount}</strong>
            <span>Takip</span>
          </button>
        </div>

        {profileNotice && (
          <p className="profile-stat-notice" role="status">
            {profileNotice}
          </p>
        )}

        <div
          className="profile-public-details"
          aria-label="Herkese açık profil bilgileri"
        >
          {summary.CityName && <span>⌖ {summary.CityName}</span>}
          {profile.ZodiacSign && <span>✦ {profile.ZodiacSign}</span>}
        </div>

        <button className="profile-edit-button" type="button" onClick={onEdit}>
          Profili düzenle
        </button>

        <button className="logout-button" type="button" onClick={onLogout}>
          Çıkış yap
        </button>
      </div>
    </section>
  );
}

function ProfileCollectionPage({
  profileUserId,
  profileUsername,
  type,
  isActive,
  onBack,
  onOpenPlace,
  onOpenUser,
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
        ? supabase.rpc("GetProfileNotes", {
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
      setErrorMessage("Liste şu an yüklenemedi. Tekrar dene.");
    } else {
      setItems(data ?? []);
    }

    setLoading(false);
  }, [profileUserId, type]);

  useEffect(() => {
    loadCollection();
  }, [loadCollection]);

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
      <header className="discovery-page-header">
        <div>
          <p className="eyebrow">@{profileUsername}</p>
          <h1>{config?.title || "Liste"}</h1>
        </div>

        <button
          className="discovery-back-button"
          type="button"
          onClick={onBack}
          aria-label="Geri dön"
        >
          ‹
          <span>Geri</span>
        </button>
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
            onOpenPlace={onOpenPlace}
            onOpenUser={onOpenUser}
          />
        )}

        {!loading && !errorMessage && items.length > 0 && type !== "notes" && (
          <ConnectionList users={items} onOpenUser={onOpenUser} />
        )}
      </div>
    </div>
  );
}

function NoteFeed({ notes, compact = false, onOpenPlace, onOpenUser }) {
  return (
    <div className={`note-feed${compact ? " note-feed-compact" : ""}`}>
      {notes.map((note) => {
        const username = note.Username || "Kullanıcı";

        return (
          <article className="note-feed-card" key={note.PlaceNoteId}>
            <div className="note-feed-avatar" aria-hidden="true">
              {username.charAt(0).toUpperCase()}
            </div>

            <div className="note-feed-content">
              <div className="note-feed-header">
                <div className="note-feed-meta">
                  {note.UserId && onOpenUser ? (
                    <button
                      className="note-feed-user-link"
                      type="button"
                      onClick={() => onOpenUser(note.UserId)}
                      title="Kullanıcı profilini aç"
                    >
                      {username}
                    </button>
                  ) : (
                    <strong>{username}</strong>
                  )}
                  <span className="note-feed-place-separator" aria-hidden="true">
                    -
                  </span>
                  <button
                    className="note-feed-place-link"
                    type="button"
                    onClick={() => onOpenPlace?.(note.PlaceId)}
                    disabled={!note.PlaceId}
                    title="Mekanı haritada aç"
                  >
                    {note.PlaceName}
                  </button>
                </div>
              </div>

              <div className="note-feed-place">
                <p className="note-feed-note-copy">{note.Content}</p>
              </div>

              <p className="note-feed-visit-date">
                Ziyaret tarihi · {formatDate(note.VisitedDate) || "Belirtilmedi"}
              </p>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function ConnectionList({ users, onOpenUser }) {
  return (
    <div className="connection-list">
      {users.map((user) => {
        const fullName = getFullName(user);
        const avatarLetter = (user.Username || fullName || "K")
          .charAt(0)
          .toUpperCase();

        return (
          <button
            className="connection-list-item"
            type="button"
            key={user.UserId}
            onClick={() => onOpenUser?.(user.UserId)}
          >
            <span className="connection-avatar" aria-hidden="true">
              {avatarLetter}
            </span>

            <span className="connection-copy">
              <strong>{user.Username}</strong>
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

function LoadingState({ compact = false }) {
  return (
    <div className={`list-state${compact ? " list-state-compact" : ""}`}>
      <span className="list-loading-dot" aria-hidden="true" />
      <span>Yükleniyor...</span>
    </div>
  );
}

function ErrorState({ message, onRetry, compact = false }) {
  return (
    <div
      className={`list-state list-state-error${compact ? " list-state-compact" : ""}`}
    >
      <p>{message}</p>
      <button type="button" onClick={onRetry}>
        Tekrar dene
      </button>
    </div>
  );
}

function EmptyCollectionState({ icon, title, message, compact = false }) {
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

function ProfileEditModal({
  profile,
  cities,
  citiesLoading,
  citiesError,
  onClose,
  onSaved,
}) {
  const [form, setForm] = useState({
    username: profile.Username ?? "",
    firstName: profile.FirstName ?? "",
    lastName: profile.LastName ?? "",
    birthDate: profile.BirthDate ?? "",
    cityId: String(profile.CityId ?? ""),
  });
  const [usernameMessage, setUsernameMessage] = useState("");
  const [usernameAvailable, setUsernameAvailable] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === "Escape" && !saving) {
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
  }, [onClose, saving]);

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
      setUsernameMessage("Mevcut kullanıcı adın.");
      return true;
    }

    if (!/^[a-z0-9._]{3,30}$/.test(normalizedUsername)) {
      setUsernameAvailable(false);
      setUsernameMessage(
        "3-30 karakter kullan: harf, rakam, nokta veya alt çizgi."
      );
      return false;
    }

    const { data, error } = await supabase.rpc("IsUsernameAvailable", {
      p_username: normalizedUsername,
    });

    if (error) {
      console.error("Kullanıcı adı kontrolü yapılamadı:", error);
      setUsernameAvailable(null);
      setUsernameMessage("Kullanıcı adı şu an kontrol edilemedi.");
      return false;
    }

    const isAvailable = Boolean(data);
    setUsernameAvailable(isAvailable);
    setUsernameMessage(
      isAvailable
        ? "Bu kullanıcı adı kullanılabilir."
        : "Bu kullanıcı adı alınmış."
    );

    return isAvailable;
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    setSaveError("");

    if (!form.firstName.trim()) {
      setSaveError("İsim zorunlu.");
      return;
    }

    if (!form.birthDate) {
      setSaveError("Doğum tarihi zorunlu.");
      return;
    }

    if (!form.cityId) {
      setSaveError("Şehir seçmelisin.");
      return;
    }

    const usernameIsValid = await checkUsername();

    if (!usernameIsValid) {
      setSaveError("Devam etmek için kullanılabilir bir kullanıcı adı seç.");
      return;
    }

    setSaving(true);

    const { error } = await supabase.rpc("UpdateMyProfile", {
      p_username: form.username.trim().toLowerCase(),
      p_first_name: form.firstName.trim(),
      p_last_name: form.lastName.trim() || null,
      p_birth_date: form.birthDate,
      p_city_id: Number(form.cityId),
    });

    if (error) {
      console.error("Profil güncellenemedi:", error);
      setSaveError(error.message || "Profil güncellenemedi.");
      setSaving(false);
      return;
    }

    await onSaved();
  };

  const handleBackdropMouseDown = (event) => {
    if (!saving && event.target === event.currentTarget) {
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
            disabled={saving}
            aria-label="Kapat"
          >
            ×
          </button>
        </div>

        <form className="profile-edit-form" onSubmit={saveProfile}>
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
              {usernameMessage}
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

          {citiesError && <p className="profile-save-error">{citiesError}</p>}
          {saveError && <p className="profile-save-error">{saveError}</p>}

          <div className="profile-modal-actions">
            <button
              className="profile-modal-cancel"
              type="button"
              onClick={onClose}
              disabled={saving}
            >
              Vazgeç
            </button>
            <button
              className="profile-modal-save"
              type="submit"
              disabled={saving || citiesLoading}
            >
              {saving ? "Kaydediliyor..." : "Kaydet"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default App;
