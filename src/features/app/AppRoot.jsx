import "../../css/tokens.css";
import "../../css/app-shell.css";
import "../../css/list-page.css";
import "../../css/profile-page.css";
import "../../css/user-discovery.css";
import "../../css/place-detail.css";
import "../../css/profile-photo.css";
import "../../css/deep-links.css";

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
import { shareOrCopyLink } from "../../utils/share.js";
import { detachCurrentPushSubscription, syncExistingPushSubscription } from "../../utils/pushNotifications.js";
import { PlaceListDetailPage, ProfileCollectionPage } from "../collections/CollectionPages.jsx";
import DeepLinkNotFoundPage from "../routing/DeepLinkNotFoundPage.jsx";
import { getCollectionDeepLinkTarget, getCollectionDeepLinkTargetById, getNoteDeepLinkTarget, getNoteDeepLinkTargetById, getPlaceDeepLinkTarget, getPlaceDeepLinkTargetById, getUserDeepLinkTargetById, getUserDeepLinkTargetByUsername } from "../routing/deepLinkApi.js";
import { ROUTE_PATHS, buildCollectionPath, buildNotePath, buildPlacePath, buildProfileCollectionPath, buildUserPath, createNavigationSnapshot, fromHistoryState, getLocationRoutePath, parseRoutePath, toHistoryState } from "../routing/routes.js";
import { ListPage } from "../feed/FeedPage.jsx";
import { NoteDetailPage } from "../notes/NoteComponents.jsx";
import { PlaceDetailPage } from "../places/PlaceDetailPage.jsx";
import { ProfileEditModal, ProfilePage } from "../profile/MyProfilePage.jsx";
import { BottomNavigation, EMPTY_SUMMARY, PROFILE_COLLECTIONS, SILENT_NOTIFICATION_REFRESH_INTERVAL_MS, SearchIcon, SettingsIcon, createDiscoveryScreenId, isIOSDevice, isPrivateAccount, renderUsernameWithLock } from "./appShared.jsx";
import { useCallback, useEffect, useRef, useState } from "react";

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

  const navigationRef = useRef(
    createNavigationSnapshot({
      activePage: "map",
      discoveryStack: [],
      mapTarget: null,
      placeReviewFilter: null,
      path: getLocationRoutePath(),
    })
  );
  const initialRouteHandledRef = useRef(false);
  const shareNoticeTimerRef = useRef(null);

  useEffect(() => {
    navigationRef.current = createNavigationSnapshot({
      ...navigationRef.current,
      activePage,
      discoveryStack,
      mapTarget,
      placeReviewFilter,
    });
  }, [activePage, discoveryStack, mapTarget, placeReviewFilter]);

  useEffect(() => () => {
    if (shareNoticeTimerRef.current) {
      window.clearTimeout(shareNoticeTimerRef.current);
    }
  }, []);

  const applyNavigationSnapshot = useCallback((snapshot, historyMode = "none") => {
    const nextNavigation = createNavigationSnapshot(snapshot);

    navigationRef.current = nextNavigation;
    setIsProfileEditOpen(false);
    setIsNotificationsOpen(false);
    setActivePage(nextNavigation.activePage);
    setDiscoveryStack(nextNavigation.discoveryStack);
    setMapTarget(nextNavigation.mapTarget);
    setPlaceReviewFilter(nextNavigation.placeReviewFilter);

    if (typeof window === "undefined" || historyMode === "none") {
      return nextNavigation;
    }

    const state = toHistoryState(nextNavigation);

    if (historyMode === "push") {
      window.history.pushState(state, "", nextNavigation.path);
    } else {
      window.history.replaceState(state, "", nextNavigation.path);
    }

    return nextNavigation;
  }, []);

  const getRootPathForPage = useCallback((page) => {
    if (page === "list") {
      return ROUTE_PATHS.FEED;
    }

    if (page === "profile") {
      return ROUTE_PATHS.PROFILE;
    }

    return ROUTE_PATHS.MAP;
  }, []);

  const pushDiscoveryScreen = useCallback((screen) => {
    const currentNavigation = navigationRef.current;
    const nextScreen = {
      id: createDiscoveryScreenId(screen.type),
      ...screen,
    };

    return applyNavigationSnapshot(
      {
        ...currentNavigation,
        discoveryStack: [...currentNavigation.discoveryStack, nextScreen],
        path: screen.path || currentNavigation.path,
      },
      "push"
    );
  }, [applyNavigationSnapshot]);

  const popDiscoveryScreen = useCallback(() => {
    if (typeof window !== "undefined" && fromHistoryState(window.history.state)) {
      window.history.back();
      return;
    }

    const currentNavigation = navigationRef.current;
    const nextStack = currentNavigation.discoveryStack.slice(0, -1);
    const nextPath =
      nextStack[nextStack.length - 1]?.path ||
      getRootPathForPage(currentNavigation.activePage);

    applyNavigationSnapshot(
      {
        ...currentNavigation,
        discoveryStack: nextStack,
        path: nextPath,
      },
      "replace"
    );
  }, [applyNavigationSnapshot, getRootPathForPage]);

  const showTemporaryAppMessage = useCallback((messageKey) => {
    if (shareNoticeTimerRef.current) {
      window.clearTimeout(shareNoticeTimerRef.current);
    }

    setAppMessage(messageKey);
    shareNoticeTimerRef.current = window.setTimeout(() => {
      setAppMessage((currentMessage) =>
        currentMessage === messageKey ? "" : currentMessage
      );
      shareNoticeTimerRef.current = null;
    }, 2800);
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
    if (!profile?.UserId) {
      return undefined;
    }

    const syncSubscription = () => {
      void syncExistingPushSubscription().catch((error) => {
        console.warn("Push aboneliği yenilenemedi:", error);
      });
    };

    const handleServiceWorkerMessage = (event) => {
      if (event.data?.type === "PUSH_SUBSCRIPTION_CHANGED") {
        syncSubscription();
      }
    };

    syncSubscription();
    navigator.serviceWorker?.addEventListener("message", handleServiceWorkerMessage);

    return () => {
      navigator.serviceWorker?.removeEventListener(
        "message",
        handleServiceWorkerMessage
      );
    };
  }, [profile?.UserId]);

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
        "UserId, PublicId, Username, FirstName, LastName, BirthDate, ZodiacSign, Email, CityId, AccountVisibilityStatusId, ProfilePhotoPath, IsActive"
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
    const nextNavigation = createNavigationSnapshot({
      ...navigationRef.current,
      mapTarget: null,
    });

    navigationRef.current = nextNavigation;
    setMapTarget(null);

    if (typeof window !== "undefined" && fromHistoryState(window.history.state)) {
      window.history.replaceState(
        toHistoryState(nextNavigation),
        "",
        nextNavigation.path
      );
    }
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

    applyNavigationSnapshot(
      {
        activePage: "map",
        discoveryStack: [],
        placeReviewFilter: null,
        path: ROUTE_PATHS.MAP,
        mapTarget: {
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
        },
      },
      "push"
    );
  }, [applyNavigationSnapshot]);

  const handleOpenPlaceDetail = useCallback(
    async (place) => {
      const context =
        place && typeof place === "object" ? place : { placeId: place };
      const placeId = Number(
        context?.placeId ?? context?.PlaceId ?? context?.id ?? place
      );

      if (!Number.isInteger(placeId) || placeId <= 0) {
        setAppMessage(MESSAGE_KEY.PLACE_TARGET_INVALID);
        return;
      }

      const { data: target, error } = await getPlaceDeepLinkTargetById(placeId);

      if (error || !target?.PublicId) {
        setAppMessage(
          getErrorMessageKey(error, MESSAGE_KEY.PLACE_TARGET_LOAD_FAILED)
        );
        return;
      }

      const publicId = String(target.PublicId);
      const path = buildPlacePath(publicId);

      if (!path) {
        setAppMessage(MESSAGE_KEY.PLACE_TARGET_LOAD_FAILED);
        return;
      }

      pushDiscoveryScreen({
        type: "place",
        placeId: Number(target.PlaceId),
        publicId,
        placeName: String(target.Name ?? "").trim() || "Mekan",
        venueCategoryCode: target.VenueCategoryCode ?? null,
        path,
      });
    },
    [pushDiscoveryScreen]
  );

  const ownUserId = profile?.UserId ?? null;

  const handleTabNavigation = useCallback(
    (page) => {
      const currentNavigation = navigationRef.current;
      const path = getRootPathForPage(page);

      if (
        currentNavigation.activePage === page &&
        currentNavigation.discoveryStack.length === 0 &&
        currentNavigation.path === path
      ) {
        return;
      }

      applyNavigationSnapshot(
        {
          activePage: page,
          discoveryStack: [],
          mapTarget: null,
          placeReviewFilter: null,
          path,
        },
        "push"
      );
    },
    [applyNavigationSnapshot, getRootPathForPage]
  );

  const openUserSearch = useCallback(() => {
    pushDiscoveryScreen({
      type: "search",
      path: ROUTE_PATHS.SEARCH,
    });
  }, [pushDiscoveryScreen]);

  const handleOpenUserProfile = useCallback(
    async (userOrId) => {
      const user =
        userOrId && typeof userOrId === "object" ? userOrId : null;
      const normalizedUserId = Number(
        user?.UserId ?? user?.ActorUserId ?? userOrId
      );

      if (!Number.isInteger(normalizedUserId) || normalizedUserId <= 0) {
        return;
      }

      if (normalizedUserId === Number(ownUserId)) {
        handleTabNavigation("profile");
        return;
      }

      const { data: target, error } = await getUserDeepLinkTargetById(
        normalizedUserId
      );

      if (error || !target?.Username) {
        setAppMessage(
          getErrorMessageKey(error, MESSAGE_KEY.USER_NOT_FOUND_OR_INACTIVE)
        );
        return;
      }

      const username = String(target.Username).trim();
      const path = buildUserPath(username);

      if (!path) {
        setAppMessage(MESSAGE_KEY.USER_NOT_FOUND_OR_INACTIVE);
        return;
      }

      pushDiscoveryScreen({
        type: "profile",
        userId: Number(target.UserId),
        username,
        isPrivate: isPrivateAccount(target.AccountVisibilityCode),
        path,
      });
    },
    [handleTabNavigation, ownUserId, pushDiscoveryScreen]
  );

  const handleExternalProfileTitleChange = useCallback(
    (userId, username, accountVisibilityCode) => {
      const normalizedUserId = Number(userId);
      const normalizedUsername = String(username ?? "").trim();
      const nextIsPrivate = isPrivateAccount(accountVisibilityCode);

      if (!Number.isInteger(normalizedUserId) || !normalizedUsername) {
        return;
      }

      const currentNavigation = navigationRef.current;
      let hasChange = false;
      const nextStack = currentNavigation.discoveryStack.map((screen) => {
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

      if (!hasChange) {
        return;
      }

      const activeScreen = nextStack[nextStack.length - 1];
      applyNavigationSnapshot(
        {
          ...currentNavigation,
          discoveryStack: nextStack,
          path: activeScreen?.path || currentNavigation.path,
        },
        "replace"
      );
    },
    [applyNavigationSnapshot]
  );

  const handleOpenNote = useCallback(
    async (noteId) => {
      const normalizedNoteId = Number(noteId);

      if (!Number.isInteger(normalizedNoteId) || normalizedNoteId <= 0) {
        return;
      }

      const { data: target, error } = await getNoteDeepLinkTargetById(
        normalizedNoteId
      );

      if (error || !target?.PublicId) {
        setAppMessage(
          getErrorMessageKey(error, MESSAGE_KEY.NOTE_NOT_FOUND_OR_RESTRICTED)
        );
        return;
      }

      const publicId = String(target.PublicId);
      const path = buildNotePath(publicId);

      if (!path) {
        setAppMessage(MESSAGE_KEY.NOTE_NOT_FOUND_OR_RESTRICTED);
        return;
      }

      pushDiscoveryScreen({
        type: "note",
        noteId: Number(target.PlaceNoteId),
        publicId,
        path,
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
    async (context) => {
      const userId = Number(context?.userId);
      const requestedType = String(context?.type ?? "").trim().toLowerCase();
      let username = String(context?.username ?? "").trim();
      let isPrivate = Boolean(context?.isPrivate);
      if (
        !Number.isInteger(userId) ||
        userId <= 0 ||
        !PROFILE_COLLECTIONS[requestedType]
      ) {
        return;
      }

      if (!username) {
        const { data: target, error } = await getUserDeepLinkTargetById(userId);

        if (error || !target?.Username) {
          setAppMessage(
            getErrorMessageKey(error, MESSAGE_KEY.USER_NOT_FOUND_OR_INACTIVE)
          );
          return;
        }

        username = String(target.Username).trim();
        isPrivate = isPrivateAccount(target.AccountVisibilityCode);
      }

      const path = buildProfileCollectionPath(username, requestedType);

      if (!path) {
        setAppMessage(MESSAGE_KEY.USER_NOT_FOUND_OR_INACTIVE);
        return;
      }

      pushDiscoveryScreen({
        type: "collection",
        userId,
        username,
        isPrivate,
        collectionType: requestedType,
        path,
      });
    },
    [pushDiscoveryScreen]
  );

  const handleOpenPlaceList = useCallback(
    async (context) => {
      const list = context?.list ?? context;
      const listId = Number(
        list?.UserPlaceListId ?? context?.userPlaceListId ?? context?.listId
      );

      if (!Number.isInteger(listId) || listId <= 0) {
        return;
      }

      const { data: target, error } = await getCollectionDeepLinkTargetById(
        listId
      );

      if (error || !target?.PublicId) {
        setAppMessage(
          getErrorMessageKey(error, MESSAGE_KEY.COLLECTION_NOT_FOUND)
        );
        return;
      }

      const publicId = String(target.PublicId);
      const path = buildCollectionPath(publicId);

      if (!path) {
        setAppMessage(MESSAGE_KEY.COLLECTION_NOT_FOUND);
        return;
      }

      const userId = Number(target.UserId);
      const isOwner =
        Number.isInteger(userId) &&
        Number.isInteger(Number(ownUserId)) &&
        userId === Number(ownUserId);

      pushDiscoveryScreen({
        type: "place-list",
        listId: Number(target.UserPlaceListId),
        publicId,
        listName: String(target.Name ?? "").trim() || "Mekan listesi",
        listDescription: String(target.Description ?? "").trim(),
        listCoverUrl: String(list?.CoverSignedUrl ?? context?.listCoverUrl ?? "").trim(),
        listIcon: String(target.Icon ?? "✦").trim() || "✦",
        userId,
        username: String(target.Username ?? "").trim(),
        isPrivate: isPrivateAccount(target.AccountVisibilityCode),
        isOwner,
        path,
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

    await detachCurrentPushSubscription();

    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error("Çıkış yapılamadı:", error);
      setAppMessage(
        getErrorMessageKey(error, MESSAGE_KEY.SIGN_OUT_FAILED)
      );
      return false;
    }

    applyNavigationSnapshot(
      createNavigationSnapshot({
        activePage: "map",
        discoveryStack: [],
        mapTarget: null,
        placeReviewFilter: null,
        path: ROUTE_PATHS.MAP,
      }),
      "replace"
    );
    setProfile(null);
    setSummary(EMPTY_SUMMARY);
    setNotifications([]);
    setNotificationsError("");
    setFollowActivity([]);
    setFollowActivityError("");
    return true;
  };

  const handleShareLink = useCallback(
    async ({ title, text, path }) => {
      if (typeof window === "undefined") {
        return;
      }

      const url = new URL(path, window.location.origin).toString();
      const result = await shareOrCopyLink({ title, text, url });

      if (result.status === "copied") {
        showTemporaryAppMessage(MESSAGE_KEY.LINK_COPIED);
      } else if (result.status === "error") {
        showTemporaryAppMessage(MESSAGE_KEY.LINK_SHARE_FAILED);
      }
    },
    [showTemporaryAppMessage]
  );

  const handleShareProfile = useCallback(
    (profileToShare) => {
      const username = String(profileToShare?.Username ?? "").trim();
      const path = buildUserPath(username);

      if (!path) {
        showTemporaryAppMessage(MESSAGE_KEY.LINK_SHARE_FAILED);
        return;
      }

      void handleShareLink({
        title: `${username} | Bizim Mekanlar`,
        text: `${username} kullanıcısının Bizim Mekanlar profili`,
        path,
      });
    },
    [handleShareLink, showTemporaryAppMessage]
  );

  const handleShareOwnProfile = useCallback(() => {
    handleShareProfile(profile);
  }, [handleShareProfile, profile]);

  const handleSharePlace = useCallback(
    (screen) => {
      const publicId = String(screen?.publicId ?? "").trim();
      const placeName = String(screen?.placeName ?? "Mekan").trim() || "Mekan";
      const path = buildPlacePath(publicId);

      if (!path) {
        showTemporaryAppMessage(MESSAGE_KEY.LINK_SHARE_FAILED);
        return;
      }

      void handleShareLink({
        title: `${placeName} | Bizim Mekanlar`,
        text: `${placeName} mekanını Bizim Mekanlar'da incele`,
        path,
      });
    },
    [handleShareLink, showTemporaryAppMessage]
  );

  const handleShareNote = useCallback(
    (screen, note) => {
      const publicId = String(screen?.publicId ?? "").trim();
      const path = buildNotePath(publicId);

      if (!path) {
        showTemporaryAppMessage(MESSAGE_KEY.LINK_SHARE_FAILED);
        return;
      }

      const noteTitle = String(note?.Title ?? "").trim() || "Not";
      const placeName = String(note?.PlaceName ?? "").trim();
      void handleShareLink({
        title: `${noteTitle} | Bizim Mekanlar`,
        text: placeName
          ? `${placeName} için bırakılan bir not`
          : "Bizim Mekanlar'da paylaşılan bir not",
        path,
      });
    },
    [handleShareLink, showTemporaryAppMessage]
  );

  const handleShareCollection = useCallback(
    (screen) => {
      const publicId = String(screen?.publicId ?? "").trim();
      const path = buildCollectionPath(publicId);

      if (!path) {
        showTemporaryAppMessage(MESSAGE_KEY.LINK_SHARE_FAILED);
        return;
      }

      const listName = String(screen?.listName ?? "Koleksiyon").trim() || "Koleksiyon";
      void handleShareLink({
        title: `${listName} | Bizim Mekanlar`,
        text: `${listName} koleksiyonunu Bizim Mekanlar'da incele`,
        path,
      });
    },
    [handleShareLink, showTemporaryAppMessage]
  );

  const createRouteScreen = useCallback((screen) => ({
    id: createDiscoveryScreenId(screen.type),
    ...screen,
  }), []);

  const buildNotFoundNavigation = useCallback(
    (path) =>
      createNavigationSnapshot({
        activePage: "map",
        discoveryStack: [
          createRouteScreen({
            type: "not-found",
            path,
          }),
        ],
        mapTarget: null,
        placeReviewFilter: null,
        path,
      }),
    [createRouteScreen]
  );

  const hydrateRouteFromLocation = useCallback(
    async ({ initial = false } = {}) => {
      const route = parseRoutePath(getLocationRoutePath());
      const existingNavigation =
        typeof window !== "undefined"
          ? fromHistoryState(window.history.state)
          : null;

      if (initial && existingNavigation) {
        applyNavigationSnapshot(existingNavigation, "none");
        return;
      }

      const rootNavigation = createNavigationSnapshot({
        activePage: "map",
        discoveryStack: [],
        mapTarget: null,
        placeReviewFilter: null,
        path: ROUTE_PATHS.MAP,
      });
      const shouldSeedInAppBack =
        initial &&
        !existingNavigation &&
        route.path !== ROUTE_PATHS.MAP &&
        typeof window !== "undefined";

      if (shouldSeedInAppBack) {
        window.history.replaceState(
          toHistoryState(rootNavigation),
          "",
          ROUTE_PATHS.MAP
        );
      }

      const historyMode = shouldSeedInAppBack ? "push" : "replace";
      let nextNavigation = null;

      if (route.kind === "map") {
        nextNavigation = rootNavigation;
      }

      if (route.kind === "feed") {
        nextNavigation = createNavigationSnapshot({
          activePage: "list",
          discoveryStack: [],
          mapTarget: null,
          placeReviewFilter: null,
          path: route.path,
        });
      }

      if (route.kind === "profile") {
        nextNavigation = createNavigationSnapshot({
          activePage: "profile",
          discoveryStack: [],
          mapTarget: null,
          placeReviewFilter: null,
          path: route.path,
        });
      }

      if (route.kind === "search") {
        nextNavigation = createNavigationSnapshot({
          activePage: "map",
          discoveryStack: [
            createRouteScreen({
              type: "search",
              path: route.path,
            }),
          ],
          mapTarget: null,
          placeReviewFilter: null,
          path: route.path,
        });
      }

      if (route.kind === "user" || route.kind === "profile-collection") {
        const { data: target } = await getUserDeepLinkTargetByUsername(
          route.username
        );

        if (target?.UserId && target?.Username) {
          const userId = Number(target.UserId);
          const username = String(target.Username).trim();
          const isPrivate = isPrivateAccount(target.AccountVisibilityCode);

          if (route.kind === "user" && userId === Number(profile?.UserId)) {
            nextNavigation = createNavigationSnapshot({
              activePage: "profile",
              discoveryStack: [],
              mapTarget: null,
              placeReviewFilter: null,
              path: buildUserPath(username) || route.path,
            });
          } else if (route.kind === "user") {
            nextNavigation = createNavigationSnapshot({
              activePage: "map",
              discoveryStack: [
                createRouteScreen({
                  type: "profile",
                  userId,
                  username,
                            isPrivate,
                  path: buildUserPath(username) || route.path,
                }),
              ],
              mapTarget: null,
              placeReviewFilter: null,
              path: buildUserPath(username) || route.path,
            });
          } else {
            const path =
              buildProfileCollectionPath(username, route.collectionType) || route.path;
            nextNavigation = createNavigationSnapshot({
              activePage: "map",
              discoveryStack: [
                createRouteScreen({
                  type: "collection",
                  userId,
                  username,
                            isPrivate,
                  collectionType: route.collectionType,
                  path,
                }),
              ],
              mapTarget: null,
              placeReviewFilter: null,
              path,
            });
          }
        }
      }

      if (route.kind === "place") {
        const { data: target } = await getPlaceDeepLinkTarget(route.publicId);

        if (target?.PlaceId && target?.PublicId) {
          const publicId = String(target.PublicId);
          const path = buildPlacePath(publicId) || route.path;
          nextNavigation = createNavigationSnapshot({
            activePage: "map",
            discoveryStack: [
              createRouteScreen({
                type: "place",
                placeId: Number(target.PlaceId),
                publicId,
                placeName: String(target.Name ?? "").trim() || "Mekan",
                venueCategoryCode: target.VenueCategoryCode ?? null,
                path,
              }),
            ],
            mapTarget: null,
            placeReviewFilter: null,
            path,
          });
        }
      }

      if (route.kind === "note") {
        const { data: target } = await getNoteDeepLinkTarget(route.publicId);

        if (target?.PlaceNoteId && target?.PublicId) {
          const publicId = String(target.PublicId);
          const path = buildNotePath(publicId) || route.path;
          nextNavigation = createNavigationSnapshot({
            activePage: "map",
            discoveryStack: [
              createRouteScreen({
                type: "note",
                noteId: Number(target.PlaceNoteId),
                publicId,
                path,
              }),
            ],
            mapTarget: null,
            placeReviewFilter: null,
            path,
          });
        }
      }

      if (route.kind === "collection") {
        const { data: target } = await getCollectionDeepLinkTarget(route.publicId);

        if (target?.UserPlaceListId && target?.PublicId) {
          const publicId = String(target.PublicId);
          const path = buildCollectionPath(publicId) || route.path;
          const userId = Number(target.UserId);
          nextNavigation = createNavigationSnapshot({
            activePage: "map",
            discoveryStack: [
              createRouteScreen({
                type: "place-list",
                listId: Number(target.UserPlaceListId),
                publicId,
                listName: String(target.Name ?? "").trim() || "Mekan listesi",
                listDescription: String(target.Description ?? "").trim(),
                listCoverUrl: "",
                listIcon: String(target.Icon ?? "✦").trim() || "✦",
                userId,
                username: String(target.Username ?? "").trim(),
                isPrivate: isPrivateAccount(target.AccountVisibilityCode),
                isOwner: userId === Number(profile?.UserId),
                path,
              }),
            ],
            mapTarget: null,
            placeReviewFilter: null,
            path,
          });
        }
      }

      applyNavigationSnapshot(
        nextNavigation || buildNotFoundNavigation(route.path),
        historyMode
      );
    },
    [
      applyNavigationSnapshot,
      buildNotFoundNavigation,
      createRouteScreen,
      profile?.UserId,
    ]
  );

  useEffect(() => {
    initialRouteHandledRef.current = false;
  }, [session?.user?.id]);

  useEffect(() => {
    if (!profile?.UserId || typeof window === "undefined") {
      return undefined;
    }

    const onPopState = (event) => {
      const snapshot = fromHistoryState(event.state);

      if (snapshot) {
        applyNavigationSnapshot(snapshot, "none");
        return;
      }

      void hydrateRouteFromLocation();
    };

    window.addEventListener("popstate", onPopState);

    if (!initialRouteHandledRef.current) {
      initialRouteHandledRef.current = true;
      void hydrateRouteFromLocation({ initial: true });
    }

    return () => window.removeEventListener("popstate", onPopState);
  }, [applyNavigationSnapshot, hydrateRouteFromLocation, profile?.UserId]);

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
            onShareProfile={handleShareOwnProfile}
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
                      onShareProfile={handleShareProfile}
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
                      onShare={(note) => handleShareNote(screen, note)}
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
                      onShare={() => handleSharePlace(screen)}
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

                  {screen.type === "not-found" && (
                    <DeepLinkNotFoundPage path={screen.path} />
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
                      onShare={() => handleShareCollection(screen)}
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
