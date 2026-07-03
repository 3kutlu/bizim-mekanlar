import "../../css/tokens.css";
import "../../css/app-shell.css";
import "../../css/list-page.css";
import "../../css/profile-page.css";
import "../../css/user-discovery.css";
import "../../css/place-detail.css";
import "../../css/profile-photo.css";

/*
 * Refactored from the application root.
 * This feature module intentionally keeps existing UI behavior intact.
 */

import NotificationsPopover from "../../components/NotificationsPopover.jsx";
import { MESSAGE_KEY, getErrorMessageKey, t } from "../../i18n/messages.js";
import AuthPage from "../auth/AuthPage.jsx";
import MapPage from "../map/MapPage.jsx";
import UserProfilePage from "../discovery/UserProfilePage.jsx";
import UserSearchPage from "../discovery/UserSearchPage.jsx";
import { supabase } from "../../supabase.js";
import { PlaceListDetailPage, ProfileCollectionPage } from "../collections/CollectionPages.jsx";
import { ListPage } from "../feed/FeedPage.jsx";
import { NoteDetailPage } from "../notes/NoteComponents.jsx";
import { PlaceDetailPage } from "../places/PlaceDetailPage.jsx";
import { ProfileEditModal, ProfilePage } from "../profile/MyProfilePage.jsx";
import { BottomNavigation, EMPTY_SUMMARY, PROFILE_COLLECTIONS, SILENT_NOTIFICATION_REFRESH_INTERVAL_MS, SearchIcon, SettingsIcon, createDiscoveryScreenId, isIOSDevice, isPrivateAccount, renderUsernameWithLock } from "./appShared.jsx";
import { useCallback, useEffect, useState } from "react";

export default function App() {
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
  const [placeListsRefreshKey, setPlaceListsRefreshKey] = useState(0);
  const [mapTarget, setMapTarget] = useState(null);
  const [placeReviewFilter, setPlaceReviewFilter] = useState(null);
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
        setAppMessage(
          getErrorMessageKey(error, MESSAGE_KEY.SESSION_LOAD_FAILED)
        );
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
        "UserId, Username, FirstName, LastName, BirthDate, ZodiacSign, Email, CityId, AccountVisibilityStatusId, ProfilePhotoPath, IsActive"
      )
      .eq("AuthUserId", session.user.id)
      .eq("IsActive", true)
      .maybeSingle();

    if (profileQueryError) {
      console.error("Profil alınamadı:", profileQueryError);
      setProfile(null);
      setSummary(EMPTY_SUMMARY);
      setProfileError(MESSAGE_KEY.PROFILE_LOAD_FAILED);
      setProfileLoading(false);
      return;
    }

    if (!profileData) {
      setProfile(null);
      setSummary(EMPTY_SUMMARY);
      setProfileError(MESSAGE_KEY.PROFILE_RECORD_MISSING);
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
        setNotificationsError("");
      }

      const { data, error } = await supabase.rpc("GetMyNotifications", {
        p_limit: 40,
      });

      if (error) {
        console.error("Bildirimler alınamadı:", error);

        // Arka plan yenilemelerinde mevcut UI'ı ve hata durumunu bozma.
        // Kullanıcı popover'ı açtığında görünür yükleme/tekrar dene akışı çalışır.
        if (!silent) {
          setNotificationsError(MESSAGE_KEY.NOTIFICATIONS_LOAD_FAILED);
        }
      } else {
        setNotifications(data ?? []);
        setNotificationsError("");
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
        setFollowActivityError("");
      }

      const { data, error } = await supabase.rpc("GetMyFollowActivity", {
        p_limit: 40,
      });

      if (error) {
        console.error("Takip hareketleri alınamadı:", error);

        // Sessiz arka plan kontrolünde mevcut listeyi koru.
        if (!silent) {
          setFollowActivity([]);
          setFollowActivityError(MESSAGE_KEY.FOLLOW_ACTIVITY_LOAD_FAILED);
        }
      } else {
        setFollowActivity(data ?? []);
        setFollowActivityError("");
      }

      if (!silent) {
        setFollowActivityLoading(false);
      }
    },
    [profile?.UserId]
  );

  const refreshNotificationCenter = useCallback(async () => {
    await Promise.all([
      loadNotifications({ silent: true }),
      loadFollowActivity({ silent: true }),
    ]);
  }, [loadFollowActivity, loadNotifications]);

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
          event: "*",
          schema: "public",
          table: "Notifications",
        },
        () => {
          void refreshNotificationCenter();
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
          void refreshNotificationCenter();
        }
      )
      .subscribe((status, error) => {
        if (status === "SUBSCRIBED") {
          // Bağlantı tekrar kurulduğunda kaçan eventleri sessizce toparla.
          void refreshNotificationCenter();
          return;
        }

        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error("Bildirim Realtime bağlantısı kurulamadı:", error);
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [profile?.UserId, refreshNotificationCenter]);

  useEffect(() => {
    if (!profile?.UserId) {
      return undefined;
    }

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshNotificationCenter();
      }
    };

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refreshNotificationCenter();
      }
    }, SILENT_NOTIFICATION_REFRESH_INTERVAL_MS);

    window.addEventListener("focus", refreshWhenVisible);
    window.addEventListener("online", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshWhenVisible);
      window.removeEventListener("online", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [profile?.UserId, refreshNotificationCenter]);

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

    await refreshNotificationCenter();

    // Popover Notlar sekmesinde açılıyor. Bu yüzden yalnızca not
    // bildirimlerini okundu sayıyoruz; Takip sekmesindeki gelişmeler
    // kullanıcı o sekmeye gerçekten girdiğinde okunacak.
    const { error } = await supabase.rpc("MarkMyNoteNotificationsRead");

    if (error) {
      console.error("Not bildirimleri okundu işaretlenemedi:", error);
      setAppMessage(MESSAGE_KEY.NOTE_NOTIFICATIONS_MARK_READ_FAILED);
      return;
    }

    await loadNotifications({ silent: true });
  }, [isNotificationsOpen, loadNotifications, refreshNotificationCenter]);

  const handleFollowActivityViewed = useCallback(async () => {
    const { error } = await supabase.rpc("MarkMyFollowActivityRead");

    if (error) {
      console.error("Takip gelişmeleri okundu işaretlenemedi:", error);
      setAppMessage(MESSAGE_KEY.FOLLOW_ACTIVITY_MARK_READ_FAILED);
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
      setCitiesError(MESSAGE_KEY.CITIES_LOAD_FAILED);
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

  const handleNoteDeleted = async () => {
    await refreshProfileSummary();
    setNotesRefreshKey((currentKey) => currentKey + 1);
  };

  const handleNoteUpdated = useCallback(() => {
    setNotesRefreshKey((currentKey) => currentKey + 1);
  }, []);

  const handlePlaceSaved = useCallback(() => {
    setPlaceListsRefreshKey((currentKey) => currentKey + 1);
  }, []);

  const handlePlaceListChanged = useCallback(() => {
    setPlaceListsRefreshKey((currentKey) => currentKey + 1);
  }, []);

  const handleFollowChanged = async () => {
    await Promise.all([
      refreshProfileSummary(),
      refreshNotificationCenter(),
    ]);
    setNotesRefreshKey((currentKey) => currentKey + 1);
  };

  const clearMapTarget = useCallback(() => {
    setMapTarget(null);
  }, []);

  const handleOpenPlaceOnMap = useCallback(async (placeId, openAction = null) => {
    const normalizedPlaceId = Number(placeId);

    if (!Number.isInteger(normalizedPlaceId) || normalizedPlaceId <= 0) {
      setAppMessage(MESSAGE_KEY.PLACE_TARGET_INVALID);
      return;
    }

    const { data, error } = await supabase.rpc("GetPlaceMapTargetV2", {
      p_place_id: normalizedPlaceId,
    });

    if (error) {
      console.error("Mekan konumu alınamadı:", error);
      setAppMessage(
        getErrorMessageKey(error, MESSAGE_KEY.PLACE_TARGET_LOAD_FAILED)
      );
      return;
    }

    const place = Array.isArray(data) ? data[0] : data;
    const latitude = Number(place?.Latitude);
    const longitude = Number(place?.Longitude);

    if (!place || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      setAppMessage(MESSAGE_KEY.PLACE_TARGET_LOCATION_INVALID);
      return;
    }

    const normalizedOpenAction = ["save", "note"].includes(
      String(openAction ?? "").trim().toLowerCase()
    )
      ? String(openAction).trim().toLowerCase()
      : null;

    setMapTarget({
      requestId: `${place.PlaceId}-${Date.now()}`,
      placeId: place.PlaceId,
      id: place.GooglePlaceId,
      name: place.Name,
      address: place.FormattedAddress,
      cityName: place.CityName,
      postalCode: place.PostalCode,
      venueCategoryCode: place.VenueCategoryCode ?? null,
      openAction: normalizedOpenAction,
      location: {
        lat: latitude,
        lng: longitude,
      },
    });

    closeDiscovery();
    setActivePage("map");
  }, [closeDiscovery]);

  const handleOpenPlaceDetail = useCallback(
    (place) => {
      const context =
        place && typeof place === "object" ? place : { placeId: place };
      const placeId = Number(
        context?.placeId ?? context?.PlaceId ?? context?.id ?? place
      );

      if (!Number.isInteger(placeId) || placeId <= 0) {
        setAppMessage(MESSAGE_KEY.PLACE_TARGET_INVALID);
        return;
      }

      const placeName =
        String(
          context?.placeName ?? context?.PlaceName ?? context?.name ?? ""
        ).trim() || "Mekan";

      pushDiscoveryScreen({
        type: "place",
        placeId,
        placeName,
        venueCategoryCode:
          context?.venueCategoryCode ?? context?.VenueCategoryCode ?? null,
      });
    },
    [pushDiscoveryScreen]
  );

  const ownUserId = profile?.UserId ?? null;

  const handleTabNavigation = useCallback(
    (page) => {
      // Profil düzenleme ekranı nav'ın altında kalır; sekme değişimi onu da kapatır.
      setIsProfileEditOpen(false);
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
    (userOrId) => {
      const user =
        userOrId && typeof userOrId === "object" ? userOrId : null;
      const normalizedUserId = Number(
        user?.UserId ?? user?.ActorUserId ?? userOrId
      );
      const username = String(
        user?.Username ?? user?.ActorUsername ?? ""
      ).trim();

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
        username,
        isPrivate: isPrivateAccount(
          user?.AccountVisibilityCode ?? user?.accountVisibilityCode
        ),
      });
    },
    [closeDiscovery, ownUserId, pushDiscoveryScreen]
  );

  const handleExternalProfileTitleChange = useCallback(
    (userId, username, accountVisibilityCode) => {
      const normalizedUserId = Number(userId);
      const normalizedUsername = String(username ?? "").trim();
      const nextIsPrivate = isPrivateAccount(accountVisibilityCode);

      if (!Number.isInteger(normalizedUserId) || !normalizedUsername) {
        return;
      }

      setDiscoveryStack((currentStack) => {
        let hasChange = false;

        const nextStack = currentStack.map((screen) => {
          if (screen.type !== "profile" || Number(screen.userId) !== normalizedUserId) {
            return screen;
          }

          if (
            screen.username === normalizedUsername &&
            Boolean(screen.isPrivate) === nextIsPrivate
          ) {
            return screen;
          }

          hasChange = true;
          return {
            ...screen,
            username: normalizedUsername,
            isPrivate: nextIsPrivate,
          };
        });

        return hasChange ? nextStack : currentStack;
      });
    },
    []
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

      const isNoteNotification = [
        "FOLLOWING_NOTE",
        "NOTE_REACTION_UP",
        "NOTE_REACTION_DOWN",
      ].includes(notification?.NotificationTypeCode);

      if (isNoteNotification) {
        const noteId = Number(
          notification?.PlaceNoteId ?? notification?.NoteId ?? 0
        );

        if (Number.isInteger(noteId) && noteId > 0) {
          handleOpenNote(noteId);
          return;
        }
      }

      if (notification?.ActorUserId) {
        handleOpenUserProfile({
          UserId: notification.ActorUserId,
          Username: notification.ActorUsername,
        });
      }
    },
    [handleOpenNote, handleOpenUserProfile]
  );

  const handleFollowRequestResponse = useCallback(
    async (activity, accept) => {
      const { error } = await supabase.rpc("RespondToFollowRequest", {
        p_follower_user_id: activity.ActorUserId,
        p_accept: accept,
      });

      if (error) {
        console.error("Takip isteği yanıtlanamadı:", error);
        setAppMessage(
          getErrorMessageKey(error, MESSAGE_KEY.FOLLOW_REQUEST_RESPONSE_FAILED)
        );
        throw error;
      }

      await Promise.all([
        refreshProfileSummary(),
        refreshNotificationCenter(),
      ]);
    },
    [refreshNotificationCenter, refreshProfileSummary]
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
        isPrivate: Boolean(context.isPrivate),
        collectionType: context.type,
      });
    },
    [pushDiscoveryScreen]
  );

  const handleOpenPlaceList = useCallback(
    (context) => {
      const list = context?.list ?? context;
      const listId = Number(
        list?.UserPlaceListId ?? context?.userPlaceListId ?? context?.listId
      );
      const userId = Number(context?.userId);
      const username = String(context?.username ?? "").trim();
      const listName =
        String(list?.Name ?? context?.listName ?? "").trim() ||
        "Mekan listesi";
      const listDescription = String(
        list?.Description ?? context?.listDescription ?? ""
      ).trim();
      const listCoverUrl = String(
        list?.CoverSignedUrl ?? context?.listCoverUrl ?? ""
      ).trim();
      const isOwner =
        Number.isInteger(userId) &&
        Number.isInteger(Number(ownUserId)) &&
        userId === Number(ownUserId);

      if (
        !Number.isInteger(listId) ||
        listId <= 0 ||
        !Number.isInteger(userId) ||
        userId <= 0
      ) {
        return;
      }

      pushDiscoveryScreen({
        type: "place-list",
        listId,
        listName,
        listDescription,
        listCoverUrl,
        listIcon: String(list?.Icon ?? context?.listIcon ?? "✦").trim() || "✦",
        userId,
        username,
        isPrivate: Boolean(context?.isPrivate),
        isOwner,
      });
    },
    [ownUserId, pushDiscoveryScreen]
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
      setProfileNotice(config.emptyMessageKey);
      return;
    }

    setProfileNotice("");
    handleOpenCollectionForUser({
      userId: profile.UserId,
      username: profile.Username,
      isPrivate: false,
      type,
    });
  };

  const handleLogout = async () => {
    setAppMessage("");

    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error("Çıkış yapılamadı:", error);
      setAppMessage(
        getErrorMessageKey(error, MESSAGE_KEY.SIGN_OUT_FAILED)
      );
      return false;
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
    return true;
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
            <p>{t(profileError || MESSAGE_KEY.PROFILE_LOAD_FAILED)}</p>
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

  const activeDiscoveryScreen =
    discoveryStack.length > 0
      ? discoveryStack[discoveryStack.length - 1]
      : null;
  const activeDiscoveryScreenId = activeDiscoveryScreen?.id ?? null;
  const isOwnProfileTopbar =
    activePage === "profile" && !activeDiscoveryScreen;
  const isDiscoveryTopbar = Boolean(activeDiscoveryScreen);
  const discoveryTopbarTitle =
    activeDiscoveryScreen?.type === "place-list"
      ? String(activeDiscoveryScreen?.listName ?? "").trim()
      : activeDiscoveryScreen?.type === "place"
        ? String(activeDiscoveryScreen?.placeName ?? "").trim()
        : ["profile", "collection"].includes(activeDiscoveryScreen?.type)
          ? renderUsernameWithLock(
              activeDiscoveryScreen?.username,
              Boolean(activeDiscoveryScreen?.isPrivate)
            )
          : "";
  const topbarTitle = discoveryTopbarTitle
    ? discoveryTopbarTitle
    : isOwnProfileTopbar
      ? profile.Username || "Profil"
      : activePage === "list"
        ? "Akış"
        : "Bizim Mekanlar";
  const showDesktopNavigation = !isOwnProfileTopbar && !isDiscoveryTopbar;

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
          className="logo-button topbar-title"
          type="button"
          onClick={() => handleTabNavigation("map")}
          title={topbarTitle}
          aria-label={`${topbarTitle}. Haritaya dön`}
        >
          {topbarTitle}
        </button>

        <div className="topbar-actions">
          {showDesktopNavigation && (
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
          )}

          {isOwnProfileTopbar && (
            <button
              className="settings-trigger"
              type="button"
              onClick={openProfileEditor}
              aria-label="Profil ayarları"
              title="Profil ayarları"
            >
              <SettingsIcon />
            </button>
          )}

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
          {t(appMessage)}
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
            notesRefreshKey={notesRefreshKey}
            isActive={activePage === "map"}
            onOpenPlaceDetail={handleOpenPlaceDetail}
            onPlaceSaved={handlePlaceSaved}
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
            placeReviewFilter={placeReviewFilter}
            onClearPlaceReviewFilter={() => setPlaceReviewFilter(null)}
            currentUserId={ownUserId}
            onOpenPlace={handleOpenPlaceDetail}
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
            notesRefreshKey={notesRefreshKey}
            placeListsRefreshKey={placeListsRefreshKey}
            currentUserId={ownUserId}
            onCollectionClick={handleProfileCollectionClick}
            onOpenPlaceList={handleOpenPlaceList}
            onOpenPlace={handleOpenPlaceDetail}
            onOpenNote={handleOpenNote}
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
                      placeListsRefreshKey={placeListsRefreshKey}
                      onBack={popDiscoveryScreen}
                      onTitleChange={handleExternalProfileTitleChange}
                      onOpenCollection={handleOpenCollectionForUser}
                      onOpenPlaceList={handleOpenPlaceList}
                      onFollowChanged={handleFollowChanged}
                      onOpenNote={handleOpenNote}
                      onOpenPlace={handleOpenPlaceDetail}
                    />
                  )}

                  {screen.type === "note" && (
                    <NoteDetailPage
                      noteId={screen.noteId}
                      isActive={isActive}
                      currentUserId={ownUserId}
                      onBack={popDiscoveryScreen}
                      onOpenPlace={handleOpenPlaceDetail}
                      onOpenUser={handleOpenUserProfile}
                      onNoteDeleted={handleNoteDeleted}
                      onNoteUpdated={handleNoteUpdated}
                    />
                  )}

                  {screen.type === "place" && (
                    <PlaceDetailPage
                      placeId={screen.placeId}
                      placeName={screen.placeName}
                      venueCategoryCode={screen.venueCategoryCode}
                      isActive={isActive}
                      currentUserId={ownUserId}
                      onBack={popDiscoveryScreen}
                      onOpenPlaceOnMap={handleOpenPlaceOnMap}
                      onOpenUser={handleOpenUserProfile}
                      onOpenNote={handleOpenNote}
                    />
                  )}

                  {screen.type === "collection" && (
                    <ProfileCollectionPage
                      profileUserId={screen.userId}
                      profileUsername={screen.username}
                      profileIsPrivate={Boolean(screen.isPrivate)}
                      type={screen.collectionType}
                      isActive={isActive}
                      refreshKey={notesRefreshKey}
                      currentUserId={ownUserId}
                      onBack={popDiscoveryScreen}
                      onOpenPlace={handleOpenPlaceDetail}
                      onOpenUser={handleOpenUserProfile}
                      onOpenNote={handleOpenNote}
                    />
                  )}

                  {screen.type === "place-list" && (
                    <PlaceListDetailPage
                      userPlaceListId={screen.listId}
                      listName={screen.listName}
                      listIcon={screen.listIcon}
                      listDescription={screen.listDescription}
                      listCoverUrl={screen.listCoverUrl}
                      profileUsername={screen.username}
                      isOwner={Boolean(screen.isOwner)}
                      isActive={isActive}
                      onBack={popDiscoveryScreen}
                      onOpenPlace={handleOpenPlaceDetail}
                      onListChanged={handlePlaceListChanged}
                    />
                  )}
                </section>
              );
            })}
          </div>
        )}
      </main>

      <BottomNavigation
        activePage={activePage}
        onNavigate={handleTabNavigation}
        liquidGlassEnabled={isIOSDevice()}
      />

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
          onLogout={handleLogout}
        />
      )}
    </div>
  );
}
