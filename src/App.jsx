import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase.js";
import AuthPage from "./AuthPage.jsx";
import MapPage from "./pages/MapPage.jsx";
import UserSearchPage from "./pages/UserSearchPage.jsx";
import UserProfilePage from "./pages/UserProfilePage.jsx";
import NotificationsPopover from "./components/NotificationsPopover.jsx";
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

function formatRelativeNoteTime(value) {
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

function getNoteTitle(note) {
  return String(note?.Title ?? "").trim() || "Başlıksız not";
}

function formatNoteRating(value) {
  const rating = Number(value);

  return Number.isInteger(rating) && rating >= 1 && rating <= 5
    ? `${rating} / 5`
    : "Puanlanmadı";
}

function ReadOnlyRatingStars({ value }) {
  const rating = Number(value);

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return <span className="note-detail-rating-empty">Puanlanmadı</span>;
  }

  return (
    <span
      className="note-detail-stars"
      role="img"
      aria-label={`${rating} üzerinden 5 yıldız`}
      title={`${rating} / 5`}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <span
          key={star}
          className={
            star <= rating
              ? "note-detail-star note-detail-star-active"
              : "note-detail-star"
          }
          aria-hidden="true"
        >
          {star <= rating ? "★" : "☆"}
        </span>
      ))}
    </span>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="10.8" cy="10.8" r="5.8" />
      <path d="m15.2 15.2 4 4" />
    </svg>
  );
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

  const [notifications, setNotifications] = useState([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState("");

  const [followActivity, setFollowActivity] = useState([]);
  const [followActivityLoading, setFollowActivityLoading] = useState(false);
  const [followActivityError, setFollowActivityError] = useState("");

  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

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
        "UserId, Username, FirstName, LastName, BirthDate, ZodiacSign, Email, CityId, AccountVisibilityStatusId, IsActive"
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

  const loadNotifications = useCallback(
    async ({ silent = false } = {}) => {
      if (!profile?.UserId) {
        setNotifications([]);
        setNotificationsError("");
        setNotificationsLoading(false);
        return;
      }

      if (!silent) {
        setNotificationsLoading(true);
      }

      setNotificationsError("");

      const { data, error } = await supabase.rpc("GetMyNotifications", {
        p_limit: 40,
      });

      if (error) {
        console.error("Bildirimler alınamadı:", error);
        setNotificationsError("Bildirimler şu an yüklenemedi.");
      } else {
        setNotifications(data ?? []);
      }

      if (!silent) {
        setNotificationsLoading(false);
      }
    },
    [profile?.UserId]
  );

  const loadFollowActivity = useCallback(
    async ({ silent = false } = {}) => {
      if (!profile?.UserId) {
        setFollowActivity([]);
        setFollowActivityError("");
        setFollowActivityLoading(false);
        return;
      }

      if (!silent) {
        setFollowActivityLoading(true);
      }

      setFollowActivityError("");

      const { data, error } = await supabase.rpc("GetMyFollowActivity", {
        p_limit: 40,
      });

      if (error) {
        console.error("Takip hareketleri alınamadı:", error);
        setFollowActivity([]);
        setFollowActivityError("Takip hareketleri şu an yüklenemedi.");
      } else {
        setFollowActivity(data ?? []);
      }

      if (!silent) {
        setFollowActivityLoading(false);
      }
    },
    [profile?.UserId]
  );

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  useEffect(() => {
    loadFollowActivity();
  }, [loadFollowActivity]);

  useEffect(() => {
    if (!profile?.UserId) {
      return undefined;
    }

    const channel = supabase
      .channel(`notification-center:${profile.UserId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "Notifications",
        },
        () => {
          loadNotifications({ silent: true });
          loadFollowActivity({ silent: true });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "UserFollows",
        },
        () => {
          loadFollowActivity({ silent: true });
        }
      )
      .subscribe((status, error) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error("Bildirim Realtime bağlantısı kurulamadı:", error);
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadFollowActivity, loadNotifications, profile?.UserId]);

  const unreadNoteCount = Number(notifications[0]?.UnreadCount ?? 0);
  const unreadFollowActivityCount = Number(
    followActivity[0]?.UnreadCount ?? 0
  );
  const unreadNotificationCount = unreadNoteCount + unreadFollowActivityCount;

  const handleNotificationToggle = useCallback(async () => {
    const willOpen = !isNotificationsOpen;
    setIsNotificationsOpen(willOpen);

    if (!willOpen) {
      return;
    }

    await Promise.all([
      loadNotifications({ silent: true }),
      loadFollowActivity({ silent: true }),
    ]);

    // Popover Notlar sekmesinde açılıyor. Bu yüzden yalnızca not
    // bildirimlerini okundu sayıyoruz; Takip sekmesindeki gelişmeler
    // kullanıcı o sekmeye gerçekten girdiğinde okunacak.
    const { error } = await supabase.rpc("MarkMyNoteNotificationsRead");

    if (error) {
      console.error("Not bildirimleri okundu işaretlenemedi:", error);
      setAppMessage("Not bildirimleri okundu işaretlenemedi.");
      return;
    }

    await loadNotifications({ silent: true });
  }, [isNotificationsOpen, loadFollowActivity, loadNotifications]);

  const handleFollowActivityViewed = useCallback(async () => {
    const { error } = await supabase.rpc("MarkMyFollowActivityRead");

    if (error) {
      console.error("Takip gelişmeleri okundu işaretlenemedi:", error);
      setAppMessage("Takip gelişmeleri okundu işaretlenemedi.");
      return;
    }

    await loadFollowActivity({ silent: true });
  }, [loadFollowActivity]);

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
    await Promise.all([refreshProfileSummary(), loadFollowActivity({ silent: true })]);
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

  const handleOpenNote = useCallback(
    (noteId) => {
      const normalizedNoteId = Number(noteId);

      if (!Number.isInteger(normalizedNoteId) || normalizedNoteId <= 0) {
        return;
      }

      pushDiscoveryScreen({
        type: "note",
        noteId: normalizedNoteId,
      });
    },
    [pushDiscoveryScreen]
  );

  const handleOpenNotification = useCallback(
    (notification) => {
      setIsNotificationsOpen(false);

      if (notification?.ActorUserId) {
        handleOpenUserProfile(notification.ActorUserId);
      }
    },
    [handleOpenUserProfile]
  );

  const handleFollowRequestResponse = useCallback(
    async (activity, accept) => {
      const { error } = await supabase.rpc("RespondToFollowRequest", {
        p_follower_user_id: activity.ActorUserId,
        p_accept: accept,
      });

      if (error) {
        console.error("Takip isteği yanıtlanamadı:", error);
        setAppMessage(error.message || "Takip isteği yanıtlanamadı.");
        throw error;
      }

      await Promise.all([
        refreshProfileSummary(),
        loadFollowActivity({ silent: true }),
        loadNotifications({ silent: true }),
      ]);
    },
    [loadFollowActivity, loadNotifications, refreshProfileSummary]
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
    setNotifications([]);
    setNotificationsError("");
    setFollowActivity([]);
    setFollowActivityError("");
    setIsNotificationsOpen(false);
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
      <header
        className={`topbar${
          isNotificationsOpen ? " topbar-notifications-open" : ""
        }`}
      >
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

          <NotificationsPopover
            isOpen={isNotificationsOpen}
            notifications={notifications}
            followActivity={followActivity}
            isLoading={notificationsLoading}
            followActivityLoading={followActivityLoading}
            errorMessage={notificationsError}
            followActivityError={followActivityError}
            unreadCount={unreadNotificationCount}
            onToggle={handleNotificationToggle}
            onRetryNotifications={loadNotifications}
            onRetryFollowActivity={loadFollowActivity}
            onFollowActivityViewed={handleFollowActivityViewed}
            onOpenNotification={handleOpenNotification}
            onRespondToRequest={handleFollowRequestResponse}
          />

          <button
            className="user-search-trigger"
            type="button"
            onClick={openUserSearch}
            aria-label="Kullanıcı ara"
            title="Kullanıcı ara"
          >
            <SearchIcon />
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
            onOpenNote={handleOpenNote}
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

                  {screen.type === "note" && (
                    <NoteDetailPage
                      noteId={screen.noteId}
                      isActive={isActive}
                      onBack={popDiscoveryScreen}
                      onOpenPlace={handleOpenPlaceOnMap}
                      onOpenUser={handleOpenUserProfile}
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
                      onOpenNote={handleOpenNote}
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



function ListPage({ refreshKey, onOpenPlace, onOpenUser, onOpenNote }) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const loadNotes = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");

    const { data, error } = await supabase.rpc("GetFollowingFeedNoteCards");

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
          onOpenNote={onOpenNote}
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
          {profile.AccountVisibilityStatusId === 2 && (
            <span>⌁ Gizli hesap</span>
          )}
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
        ? supabase.rpc("GetProfileNoteCards", {
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

function NoteFeed({ notes, compact = false, onOpenPlace, onOpenUser, onOpenNote }) {
  return (
    <div className={`note-feed${compact ? " note-feed-compact" : ""}`}>
      {notes.map((note) => {
        const username = note.Username || "Kullanıcı";
        const title = getNoteTitle(note);
        const canOpenNote = Boolean(note.PlaceNoteId && onOpenNote);

        const openNote = () => {
          if (canOpenNote) {
            onOpenNote(note.PlaceNoteId);
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
            }`}
            key={note.PlaceNoteId}
            onClick={openNote}
            onKeyDown={handleCardKeyDown}
            tabIndex={canOpenNote ? 0 : undefined}
            aria-label={canOpenNote ? `${title} not detayını aç` : undefined}
          >
            {note.UserId && onOpenUser ? (
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
                {username.charAt(0).toUpperCase()}
              </button>
            ) : (
              <div className="note-feed-avatar" aria-hidden="true">
                {username.charAt(0).toUpperCase()}
              </div>
            )}

            <div className="note-feed-content">
              <div className="note-feed-header">
                <div className="note-feed-meta">
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
                    </button>
                  ) : (
                    <strong>{username}</strong>
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
                      onOpenPlace?.(note.PlaceId);
                    }}
                    disabled={!note.PlaceId}
                    title="Mekanı haritada aç"
                  >
                    {note.PlaceName}
                  </button>
                </div>
              </div>

              <div className="note-feed-summary-button">
                <strong>{title}</strong>
                <span>{formatNoteRating(note.Rating)}</span>
              </div>

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

function NoteDetailPage({
  noteId,
  isActive,
  onBack,
  onOpenPlace,
  onOpenUser,
}) {
  const [note, setNote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const loadNote = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");

    const { data, error } = await supabase.rpc("GetPlaceNoteDetail", {
      p_place_note_id: noteId,
    });

    if (error) {
      console.error("Not detayı alınamadı:", error);
      setNote(null);
      setErrorMessage(error.message || "Not şu an açılamadı.");
    } else {
      const detail = Array.isArray(data) ? data[0] : data;

      if (!detail) {
        setNote(null);
        setErrorMessage("Not bulunamadı veya erişime kapalı.");
      } else {
        setNote(detail);
      }
    }

    setLoading(false);
  }, [noteId]);

  useEffect(() => {
    loadNote();
  }, [loadNote]);

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

  const username = note?.Username || "Kullanıcı";
  const fullName = getFullName(note);
  const avatarLetter = (username || fullName || "K").charAt(0).toUpperCase();

  return (
    <div className="discovery-page-content note-detail-page">
      <header className="discovery-page-header">
        <div>
          <p className="eyebrow">NOT DETAYI</p>
          <h1>{note ? getNoteTitle(note) : "Not"}</h1>
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
          <ErrorState message={errorMessage} onRetry={loadNote} compact />
        )}

        {!loading && note && (
          <article className="note-detail-card">
            <div className="note-detail-topline">
              <button
                className="note-detail-author"
                type="button"
                onClick={() => onOpenUser?.(note.UserId)}
                disabled={!note.UserId || !onOpenUser}
                title="Kullanıcı profilini aç"
              >
                <span className="note-detail-avatar" aria-hidden="true">
                  {avatarLetter}
                </span>
                <span>
                  <strong>{username}</strong>
                  <small>{fullName || username}</small>
                </span>
              </button>

              <ReadOnlyRatingStars value={note.Rating} />
            </div>

            <button
              className="note-detail-place"
              type="button"
              onClick={() => onOpenPlace?.(note.PlaceId)}
              disabled={!note.PlaceId || !onOpenPlace}
              title="Mekanı haritada aç"
            >
              <strong>{note.PlaceName || "İsimsiz mekan"}</strong>
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

            <div className="note-detail-coming-soon">
              <strong>Puanlamalar ve fotoğraflar</strong>
              <span>Yakında bu notta burada yer alacak.</span>
            </div>
          </article>
        )}
      </div>
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
    isPrivateAccount: profile.AccountVisibilityStatusId === 2,
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
      p_account_visibility_code: form.isPrivateAccount
        ? "PRIVATE"
        : "PUBLIC",
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
