import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "./supabase.js";
import {
  getErrorMessageKey,
  MESSAGE_KEY,
  t,
} from "./i18n/messages.js";
import {
  getVenueCategoryIcon,
  getVenueCategoryLabel,
} from "./utils/venueCategory.js";
import {
  MAX_NOTE_PHOTOS,
  createNotePhotoDrafts,
  createSignedNotePhotoUrls,
  getPhotoSelectionError,
  revokeNotePhotoDrafts,
  uploadMyNotePhotoDrafts,
} from "./utils/notePhotos.js";
import AuthPage from "./pages/AuthPage.jsx";
import MapPage from "./pages/MapPage.jsx";
import UserSearchPage from "./pages/UserSearchPage.jsx";
import UserProfilePage from "./pages/UserProfilePage.jsx";
import NotificationsPopover from "./components/NotificationsPopover.jsx";
import "./css/app-shell.css";
import "./css/list-page.css";
import "./css/profile-page.css";
import "./css/user-discovery.css";
import "./css/place-detail.css";

const EMPTY_SUMMARY = {
  CityName: "",
  FollowerCount: 0,
  FollowingCount: 0,
  NoteCount: 0,
};

const SILENT_NOTIFICATION_REFRESH_INTERVAL_MS = 60_000;

const PROFILE_COLLECTIONS = {
  notes: {
    title: "Notlar",
    emptyMessageKey: MESSAGE_KEY.PROFILE_COLLECTION_NOTES_EMPTY,
  },
  followers: {
    title: "Takipçiler",
    emptyMessageKey: MESSAGE_KEY.PROFILE_COLLECTION_FOLLOWERS_EMPTY,
  },
  following: {
    title: "Takip edilenler",
    emptyMessageKey: MESSAGE_KEY.PROFILE_COLLECTION_FOLLOWING_EMPTY,
  },
};


const PROFILE_TAB_IDS = Object.freeze({
  NOTES: "notes",
  PHOTOS: "photos",
  SAVED: "saved",
});

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

function toDateInputValue(value) {
  const normalizedValue = String(value ?? "").trim();

  if (!normalizedValue) {
    return "";
  }

  const isoDate = normalizedValue.match(/^\d{4}-\d{2}-\d{2}/)?.[0];

  if (isoDate) {
    return isoDate;
  }

  const date = new Date(normalizedValue);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
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


const EMPTY_NOTE_REACTION_SUMMARY = Object.freeze({
  UpCount: 0,
  DownCount: 0,
  MyReactionCode: null,
});

function normalizeReactionSummary(value) {
  const code = String(value?.MyReactionCode ?? "").trim().toUpperCase();

  return {
    UpCount: Math.max(0, Number(value?.UpCount) || 0),
    DownCount: Math.max(0, Number(value?.DownCount) || 0),
    MyReactionCode: code === "UP" || code === "DOWN" ? code : null,
  };
}

/*
  Feed, profile collection ve note-detail RPC'leri bazı yerlerde alanları
  farklı casing ile döndürebiliyor. Reaksiyonu her zaman notun kendi ID'sine
  bağlamak için tek bir normalizer kullanıyoruz.
*/
function getReactionNoteId(note) {
  const candidate =
    note?.PlaceNoteId ??
    note?.PlaceNoteID ??
    note?.placeNoteId ??
    note?.NoteId ??
    note?.NoteID ??
    note?.noteId ??
    note?.Id ??
    note?.id ??
    null;

  const normalizedId = Number(candidate);

  return Number.isInteger(normalizedId) && normalizedId > 0
    ? normalizedId
    : null;
}

/*
  Supabase JSONB dönen RPC'leri doğrudan dizi, stringleşmiş JSON veya
  { data: [] } / { items: [] } şeklinde alabilir. Hepsini kart bazlı
  reaction summary listesine çeviriyoruz.
*/
function getReactionSummaryRows(payload) {
  let normalizedPayload = payload;

  if (typeof normalizedPayload === "string") {
    try {
      normalizedPayload = JSON.parse(normalizedPayload);
    } catch {
      return [];
    }
  }

  if (Array.isArray(normalizedPayload)) {
    return normalizedPayload;
  }

  if (Array.isArray(normalizedPayload?.data)) {
    return normalizedPayload.data;
  }

  if (Array.isArray(normalizedPayload?.items)) {
    return normalizedPayload.items;
  }

  if (
    normalizedPayload &&
    typeof normalizedPayload === "object" &&
    getReactionNoteId(normalizedPayload)
  ) {
    return [normalizedPayload];
  }

  return [];
}

function NoteReactionControls({
  noteId,
  noteOwnerUserId,
  currentUserId,
  summary,
  onSummaryChange,
  variant = "feed",
}) {
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const normalizedNoteId = Number(noteId);
  const normalizedOwnerId = Number(noteOwnerUserId);
  const normalizedCurrentUserId = Number(currentUserId);
  const isOwnNote =
    Number.isInteger(normalizedOwnerId) &&
    Number.isInteger(normalizedCurrentUserId) &&
    normalizedOwnerId === normalizedCurrentUserId;
  const reactionSummary = normalizeReactionSummary(summary);

  const updateReaction = async (event, requestedCode) => {
    event.stopPropagation();

    if (
      isOwnNote ||
      isSaving ||
      !Number.isInteger(normalizedNoteId) ||
      normalizedNoteId <= 0
    ) {
      return;
    }

    const nextCode =
      reactionSummary.MyReactionCode === requestedCode ? null : requestedCode;

    setIsSaving(true);
    setErrorMessage("");

    const { data, error } = await supabase.rpc("SetMyPlaceNoteReaction", {
      p_place_note_id: normalizedNoteId,
      p_reaction_code: nextCode,
    });

    if (error) {
      console.error("Not reaksiyonu güncellenemedi:", error);
      setErrorMessage(error.message || "Reaksiyon güncellenemedi.");
      setIsSaving(false);
      return;
    }

    const nextSummary = Array.isArray(data) ? data[0] : data;
    onSummaryChange?.(normalizedNoteId, normalizeReactionSummary(nextSummary));
    setIsSaving(false);
  };

  const controlsClassName = `note-reactions note-reactions-${variant}`;

  if (isOwnNote) {
    return (
      <div
        className={`${controlsClassName} note-reactions-readonly`}
        aria-label={`${reactionSummary.UpCount} beğeni, ${reactionSummary.DownCount} beğenmeme`}
      >
        <span className="note-reaction-static">
          <strong>{reactionSummary.UpCount}</strong>
          <span aria-hidden="true">👍</span>
        </span>
        <span className="note-reaction-static">
          <strong>{reactionSummary.DownCount}</strong>
          <span aria-hidden="true">👎</span>
        </span>
      </div>
    );
  }

  return (
    <div className={controlsClassName} aria-label="Not reaksiyonları">
      <button
        className={`note-reaction-button note-reaction-up${
          reactionSummary.MyReactionCode === "UP" ? " note-reaction-active" : ""
        }`}
        type="button"
        disabled={isSaving || !Number.isInteger(normalizedNoteId)}
        aria-pressed={reactionSummary.MyReactionCode === "UP"}
        aria-label={`${reactionSummary.UpCount} beğeni. ${
          reactionSummary.MyReactionCode === "UP" ? "Beğeniyi kaldır" : "Beğen"
        }`}
        title={reactionSummary.MyReactionCode === "UP" ? "Beğeniyi kaldır" : "Beğen"}
        onClick={(event) => updateReaction(event, "UP")}
      >
        <strong>{reactionSummary.UpCount}</strong>
        <span aria-hidden="true">👍</span>
      </button>

      <button
        className={`note-reaction-button note-reaction-down${
          reactionSummary.MyReactionCode === "DOWN" ? " note-reaction-active" : ""
        }`}
        type="button"
        disabled={isSaving || !Number.isInteger(normalizedNoteId)}
        aria-pressed={reactionSummary.MyReactionCode === "DOWN"}
        aria-label={`${reactionSummary.DownCount} beğenmeme. ${
          reactionSummary.MyReactionCode === "DOWN"
            ? "Beğenmemeyi kaldır"
            : "Beğenme"
        }`}
        title={
          reactionSummary.MyReactionCode === "DOWN"
            ? "Beğenmemeyi kaldır"
            : "Beğenme"
        }
        onClick={(event) => updateReaction(event, "DOWN")}
      >
        <strong>{reactionSummary.DownCount}</strong>
        <span aria-hidden="true">👎</span>
      </button>

      {errorMessage && (
        <span className="note-reaction-error" role="alert">
          {errorMessage}
        </span>
      )}
    </div>
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

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 8.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2Z" />
      <path d="m19.4 13.3 1.2.9-1.8 3.1-1.5-.6a7.7 7.7 0 0 1-1.7 1l-.2 1.6h-3.6l-.2-1.6a7.7 7.7 0 0 1-1.7-1l-1.5.6-1.8-3.1 1.2-.9a7.2 7.2 0 0 1 0-2.6L7.6 9.8l1.8-3.1 1.5.6a7.7 7.7 0 0 1 1.7-1l.2-1.6h3.6l.2 1.6a7.7 7.7 0 0 1 1.7 1l1.5-.6 1.8 3.1-1.2.9a7.2 7.2 0 0 1 0 2.6Z" />
    </svg>
  );
}

function getFullName(user) {
  return [user?.FirstName, user?.LastName].filter(Boolean).join(" ");
}


const BOTTOM_NAV_ITEMS = Object.freeze([
  { id: "map", label: "Harita", icon: "⌖" },
  { id: "list", label: "Liste", icon: "☷" },
  { id: "profile", label: "Profil", icon: "◉" },
]);

function isIOSDevice() {
  if (typeof navigator === "undefined") {
    return false;
  }

  const userAgent = navigator.userAgent || "";

  return (
    /iPad|iPhone|iPod/.test(userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function getBottomNavIndex(pageId) {
  const index = BOTTOM_NAV_ITEMS.findIndex((item) => item.id === pageId);

  return index >= 0 ? index : 0;
}

function BottomNavigation({ activePage, onNavigate, liquidGlassEnabled }) {
  const navRef = useRef(null);
  const dragRef = useRef(null);
  const suppressClickRef = useRef(false);

  const setLensToIndex = useCallback(
    (index, { stretch = 0, tilt = 0 } = {}) => {
      const nav = navRef.current;

      if (!nav || !liquidGlassEnabled) {
        return;
      }

      const innerWidth = Math.max(0, nav.getBoundingClientRect().width - 12);
      const cellWidth = innerWidth / BOTTOM_NAV_ITEMS.length;

      nav.style.setProperty(
        "--liquid-x",
        `${Math.max(0, Math.min(BOTTOM_NAV_ITEMS.length - 1, index)) * cellWidth}px`
      );
      nav.style.setProperty("--liquid-stretch", String(stretch));
      nav.style.setProperty("--liquid-tilt", `${tilt}deg`);
    },
    [liquidGlassEnabled]
  );

  useEffect(() => {
    if (!liquidGlassEnabled) {
      return undefined;
    }

    const syncLens = () => setLensToIndex(getBottomNavIndex(activePage));

    syncLens();
    window.addEventListener("resize", syncLens);

    return () => window.removeEventListener("resize", syncLens);
  }, [activePage, liquidGlassEnabled, setLensToIndex]);

  const finishDrag = useCallback(
    (event, cancelled = false) => {
      const nav = navRef.current;
      const drag = dragRef.current;

      if (!nav || !drag || event.pointerId !== drag.pointerId) {
        return;
      }

      if (nav.hasPointerCapture?.(event.pointerId)) {
        nav.releasePointerCapture(event.pointerId);
      }

      nav.dataset.dragging = "false";
      dragRef.current = null;

      if (!drag.moved || cancelled) {
        setLensToIndex(getBottomNavIndex(activePage));
        return;
      }

      const destinationIndex = Math.max(
        0,
        Math.min(
          BOTTOM_NAV_ITEMS.length - 1,
          Math.round(drag.currentX / drag.cellWidth)
        )
      );
      const destinationPage = BOTTOM_NAV_ITEMS[destinationIndex].id;

      setLensToIndex(destinationIndex);
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);

      if (destinationPage !== activePage) {
        onNavigate(destinationPage);
      }
    },
    [activePage, onNavigate, setLensToIndex]
  );

  const handlePointerDown = (event) => {
    if (
      !liquidGlassEnabled ||
      event.pointerType === "mouse" ||
      !event.isPrimary ||
      !navRef.current
    ) {
      return;
    }

    const nav = navRef.current;
    const innerWidth = Math.max(0, nav.getBoundingClientRect().width - 12);
    const cellWidth = innerWidth / BOTTOM_NAV_ITEMS.length;
    const activeIndex = getBottomNavIndex(activePage);

    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startLensX: activeIndex * cellWidth,
      cellWidth,
      currentX: activeIndex * cellWidth,
      moved: false,
    };

    nav.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event) => {
    const nav = navRef.current;
    const drag = dragRef.current;

    if (!nav || !drag || event.pointerId !== drag.pointerId) {
      return;
    }

    const deltaX = event.clientX - drag.startX;

    if (!drag.moved && Math.abs(deltaX) < 7) {
      return;
    }

    drag.moved = true;
    event.preventDefault();
    nav.dataset.dragging = "true";

    const edgeAllowance = drag.cellWidth * 0.13;
    const minX = -edgeAllowance;
    const maxX = drag.cellWidth * (BOTTOM_NAV_ITEMS.length - 1) + edgeAllowance;
    const currentX = Math.max(
      minX,
      Math.min(maxX, drag.startLensX + deltaX)
    );
    const stretch = Math.min(0.12, Math.abs(deltaX) / 520);
    const tilt = Math.max(-1.7, Math.min(1.7, deltaX / 48));

    drag.currentX = currentX;
    nav.style.setProperty("--liquid-x", `${currentX}px`);
    nav.style.setProperty("--liquid-stretch", String(stretch));
    nav.style.setProperty("--liquid-tilt", `${tilt}deg`);
  };

  const handleButtonClick = (pageId) => {
    if (suppressClickRef.current) {
      return;
    }

    onNavigate(pageId);
  };

  return (
    <nav
      ref={navRef}
      className={`bottom-nav${
        liquidGlassEnabled ? " bottom-nav-liquid-glass" : ""
      }`}
      aria-label="Alt menü"
      data-dragging="false"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={(event) => finishDrag(event, true)}
    >
      {BOTTOM_NAV_ITEMS.map((item) => (
        <button
          key={item.id}
          type="button"
          className={activePage === item.id ? "bottom-nav-active" : ""}
          aria-current={activePage === item.id ? "page" : undefined}
          onClick={() => handleButtonClick(item.id)}
        >
          <span>{item.icon}</span>
          {item.label}
        </button>
      ))}
    </nav>
  );
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
        "UserId, Username, FirstName, LastName, BirthDate, ZodiacSign, Email, CityId, AccountVisibilityStatusId, IsActive"
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
      });
    },
    [closeDiscovery, ownUserId, pushDiscoveryScreen]
  );

  const handleExternalProfileTitleChange = useCallback((userId, username) => {
    const normalizedUserId = Number(userId);
    const normalizedUsername = String(username ?? "").trim();

    if (!Number.isInteger(normalizedUserId) || !normalizedUsername) {
      return;
    }

    setDiscoveryStack((currentStack) => {
      let hasChange = false;

      const nextStack = currentStack.map((screen) => {
        if (
          screen.type !== "profile" ||
          Number(screen.userId) !== normalizedUserId ||
          screen.username === normalizedUsername
        ) {
          return screen;
        }

        hasChange = true;
        return {
          ...screen,
          username: normalizedUsername,
        };
      });

      return hasChange ? nextStack : currentStack;
    });
  }, []);

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
        listIcon: String(list?.Icon ?? context?.listIcon ?? "✦").trim() || "✦",
        userId,
        username,
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
          ? String(activeDiscoveryScreen?.username ?? "").trim()
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



function ListPage({
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
      setNotes(data ?? []);
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
          icon={isPlaceReviewMode ? "✦" : "✦"}
          title={
            isPlaceReviewMode
              ? "Bu mekanda sana görünür yorum yok"
              : "Akışta henüz not yok"
          }
          message={
            isPlaceReviewMode
              ? "İlk yorumu sen ekleyebilirsin."
              : "Sen veya takip ettiğin kişiler not eklediğinde burada göreceksin."
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

function ProfilePage({
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
  const [editingList, setEditingList] = useState(null);

  const fullName = getFullName(profile);
  const avatarLetter = (profile.Username || profile.FirstName || "K")
    .charAt(0)
    .toUpperCase();

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

    const { data, error } = await supabase.rpc("GetMyPlaceListsV2");

    if (error) {
      console.error("Kişisel mekan listeleri alınamadı:", error);
      setPlaceLists([]);
      setListsError("Mekan listelerin şu an yüklenemedi. Tekrar dene.");
    } else {
      setPlaceLists(data ?? []);
    }

    setListsLoading(false);
  }, []);

  useEffect(() => {
    if (activeTab !== PROFILE_TAB_IDS.NOTES) {
      return;
    }

    void loadProfileNotes();
  }, [activeTab, loadProfileNotes, notesRefreshKey]);

  useEffect(() => {
    if (activeTab !== PROFILE_TAB_IDS.PHOTOS) {
      return;
    }

    void loadProfilePhotos();
  }, [activeTab, loadProfilePhotos, notesRefreshKey]);

  useEffect(() => {
    if (activeTab !== PROFILE_TAB_IDS.SAVED) {
      return;
    }

    void loadPlaceLists();
  }, [activeTab, loadPlaceLists, placeListsRefreshKey]);

  const handlePlaceListSaved = (updatedList) => {
    const updatedListId = Number(updatedList?.UserPlaceListId);

    if (!Number.isInteger(updatedListId) || updatedListId <= 0) {
      return;
    }

    setPlaceLists((currentLists) =>
      currentLists.map((currentList) =>
        Number(currentList?.UserPlaceListId) === updatedListId
          ? { ...currentList, ...updatedList }
          : currentList
      )
    );
    setEditingList(null);
  };

  const isPrivateAccount = profile.AccountVisibilityStatusId === 2;

  return (
    <section className="profile-page page-section">
      <div className="profile-card">
        <div className="profile-top">
          <div className="profile-avatar" aria-hidden="true">
            {avatarLetter}
          </div>

          <div className="profile-identity">
            <h1>{fullName || profile.Username}</h1>

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
          {summary.CityName && <span>⌖ {summary.CityName}</span>}
          {profile.ZodiacSign && <span>✦ {profile.ZodiacSign}</span>}
          {isPrivateAccount && <span>⌁ Gizli hesap</span>}
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
            Notlar
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
            Fotoğraflar
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
            Kaydedilenler
          </button>
        </div>

        <div
          className="profile-tab-panel"
          id={`profile-tab-panel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`profile-tab-${activeTab}`}
        >
          {activeTab === PROFILE_TAB_IDS.NOTES && (
            <ProfileNotesTab
              notes={profileNotes}
              loading={notesLoading}
              errorMessage={notesError}
              currentUserId={currentUserId}
              onRetry={loadProfileNotes}
              onOpenPlace={onOpenPlace}
              onOpenNote={onOpenNote}
            />
          )}

          {activeTab === PROFILE_TAB_IDS.PHOTOS && (
            <ProfilePhotosTab
              photos={profilePhotos}
              loading={photosLoading}
              errorMessage={photosError}
              onRetry={loadProfilePhotos}
              onOpenNote={onOpenNote}
            />
          )}

          {activeTab === PROFILE_TAB_IDS.SAVED && (
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
              onEditList={setEditingList}
            />
          )}
        </div>
      </div>

      {editingList &&
        createPortal(
          <PlaceListEditModal
            list={editingList}
            onClose={() => setEditingList(null)}
            onSaved={handlePlaceListSaved}
          />,
          document.body
        )}
    </section>
  );
}

function ProfileNotesTab({
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
        <span className="profile-tab-empty-icon" aria-hidden="true">
          ✦
        </span>
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

function ProfilePhotosTab({ photos, loading, errorMessage, onRetry, onOpenNote }) {
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
        <span className="profile-tab-empty-icon" aria-hidden="true">
          ◌
        </span>
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

function ProfileSavedTab({
  lists,
  loading,
  errorMessage,
  accountIsPrivate,
  onRetry,
  onOpenList,
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
        <span className="profile-tab-empty-icon" aria-hidden="true">
          ▤
        </span>
        <h2>Henüz mekan listen yok</h2>
        <p>Haritadan mekan kaydettiğinde listelerin burada görünür.</p>
      </div>
    );
  }

  return (
    <div className="profile-saved-list" aria-label="Mekan listelerin">
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
              <span className="profile-saved-list-icon" aria-hidden="true">
                {list.Icon || "✦"}
              </span>

              <span className="profile-saved-list-copy">
                <strong>{list.Name}</strong>
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
              <span aria-hidden="true">⋯</span>
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

function PlaceListEditModal({ list, onClose, onSaved }) {
  const [name, setName] = useState(String(list?.Name ?? "").trim());
  const [visibilityCode, setVisibilityCode] = useState(
    String(list?.VisibilityCode ?? "PRIVATE").trim().toUpperCase() === "PUBLIC"
      ? "PUBLIC"
      : "PRIVATE"
  );
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !isSaving) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isSaving, onClose]);

  const handleSubmit = async (event) => {
    event.preventDefault();

    const nextName = name.trim();
    const listId = Number(list?.UserPlaceListId);

    if (!nextName) {
      setErrorMessage("Liste adı boş olamaz.");
      return;
    }

    if (!Number.isInteger(listId) || listId <= 0) {
      setErrorMessage("Liste bilgisi geçersiz.");
      return;
    }

    setIsSaving(true);
    setErrorMessage("");

    const { error } = await supabase.rpc("UpdateMyPlaceList", {
      p_user_place_list_id: listId,
      p_name: nextName,
      p_visibility_code: visibilityCode,
    });

    if (error) {
      console.error("Mekan listesi güncellenemedi:", error);
      setErrorMessage(error.message || "Liste güncellenemedi. Tekrar dene.");
      setIsSaving(false);
      return;
    }

    onSaved({
      ...list,
      Name: nextName,
      VisibilityCode: visibilityCode,
    });
  };

  const handleBackdropMouseDown = (event) => {
    if (!isSaving && event.target === event.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="place-list-edit-backdrop"
      role="presentation"
      onMouseDown={handleBackdropMouseDown}
    >
      <section
        className="place-list-edit-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="place-list-edit-title"
      >
        <div className="place-list-edit-header">
          <div>
            <p className="eyebrow">KOLEKSİYON</p>
            <h2 id="place-list-edit-title">Listeyi düzenle</h2>
          </div>
          <button
            className="place-list-edit-close"
            type="button"
            onClick={onClose}
            disabled={isSaving}
            aria-label="Kapat"
          >
            ×
          </button>
        </div>

        <form className="place-list-edit-form" onSubmit={handleSubmit}>
          <label>
            Liste adı
            <input
              type="text"
              value={name}
              minLength="1"
              maxLength="80"
              autoFocus
              disabled={isSaving}
              onChange={(event) => setName(event.target.value)}
            />
          </label>

          <label>
            Görünürlük
            <select
              value={visibilityCode}
              disabled={isSaving}
              onChange={(event) => setVisibilityCode(event.target.value)}
            >
              <option value="PRIVATE">Gizli</option>
              <option value="PUBLIC">Herkese açık</option>
            </select>
            <small>
              Herkese açık listeler, profilini görebilen kişilere görünür.
            </small>
          </label>

          {errorMessage && (
            <p className="place-list-edit-error" role="alert">
              {errorMessage}
            </p>
          )}

          <div className="place-list-edit-actions">
            <button
              className="place-list-edit-cancel"
              type="button"
              onClick={onClose}
              disabled={isSaving}
            >
              Vazgeç
            </button>
            <button
              className="place-list-edit-save"
              type="submit"
              disabled={isSaving}
            >
              {isSaving ? "Kaydediliyor..." : "Kaydet"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function PlaceListDetailPage({
  userPlaceListId,
  listName,
  listIcon,
  profileUsername,
  isOwner = false,
  isActive,
  onBack,
  onOpenPlace,
  onListChanged,
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
      <header className="discovery-page-header place-list-detail-header">
        <div>
          {profileUsername && <p className="eyebrow">@{profileUsername}</p>}
          <h1>
            <span className="place-list-detail-title-icon" aria-hidden="true">
              {listIcon || "✦"}
            </span>
            {normalizedListName}
          </h1>
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

function PlaceListItemRemoveModal({
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

function ProfileCollectionPage({
  profileUserId,
  profileUsername,
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


function PlaceDetailPage({
  placeId,
  placeName,
  venueCategoryCode,
  isActive,
  currentUserId,
  onBack,
  onOpenPlaceOnMap,
  onOpenUser,
  onOpenNote,
}) {
  const [place, setPlace] = useState(null);
  const [notes, setNotes] = useState([]);
  const [placePhotos, setPlacePhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notesLoading, setNotesLoading] = useState(true);
  const [photosLoading, setPhotosLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [notesError, setNotesError] = useState("");
  const [photosError, setPhotosError] = useState("");
  const [sortBy, setSortBy] = useState("newest");

  const normalizedPlaceId = Number(placeId);

  const loadPlace = useCallback(async () => {
    if (!Number.isInteger(normalizedPlaceId) || normalizedPlaceId <= 0) {
      setPlace(null);
      setNotes([]);
      setPlacePhotos([]);
      setLoading(false);
      setNotesLoading(false);
      setPhotosLoading(false);
      setErrorMessage("Mekan bilgisi bulunamadı.");
      return;
    }

    setLoading(true);
    setNotesLoading(true);
    setPhotosLoading(true);
    setErrorMessage("");
    setNotesError("");
    setPhotosError("");

    const [placeResult, notesResult, photosResult] = await Promise.all([
      supabase.rpc("GetPlaceMapTargetV2", {
        p_place_id: normalizedPlaceId,
      }),
      supabase.rpc("GetPlaceVisibleNoteCards", {
        p_place_id: normalizedPlaceId,
      }),
      supabase.rpc("GetPlaceVisibleNotePhotos", {
        p_place_id: normalizedPlaceId,
        p_limit: 120,
      }),
    ]);

    if (placeResult.error) {
      console.error("Mekan detayı alınamadı:", placeResult.error);
      setPlace(null);
      setNotes([]);
      setPlacePhotos([]);
      setErrorMessage(
        getErrorMessageKey(placeResult.error, MESSAGE_KEY.PLACE_TARGET_LOAD_FAILED)
      );
      setLoading(false);
      setNotesLoading(false);
      setPhotosLoading(false);
      return;
    }

    const placeData = Array.isArray(placeResult.data)
      ? placeResult.data[0]
      : placeResult.data;

    if (!placeData) {
      setPlace(null);
      setNotes([]);
      setPlacePhotos([]);
      setErrorMessage("Mekan bulunamadı veya artık aktif değil.");
      setLoading(false);
      setNotesLoading(false);
      setPhotosLoading(false);
      return;
    }

    setPlace(placeData);
    setLoading(false);

    if (notesResult.error) {
      console.error("Mekan yorumları alınamadı:", notesResult.error);
      setNotes([]);
      setNotesError(
        getErrorMessageKey(notesResult.error, MESSAGE_KEY.PLACE_REVIEWS_LOAD_FAILED)
      );
    } else {
      setNotes(notesResult.data ?? []);
    }

    setNotesLoading(false);

    if (photosResult.error) {
      console.error("Mekan fotoğrafları alınamadı:", photosResult.error);
      setPlacePhotos([]);
      setPhotosError("Mekan fotoğrafları şu an yüklenemedi. Tekrar dene.");
    } else {
      try {
        const signedPhotos = await createSignedNotePhotoUrls(photosResult.data ?? []);
        setPlacePhotos(signedPhotos);
      } catch (error) {
        console.error("Mekan fotoğraf bağlantıları oluşturulamadı:", error);
        setPlacePhotos([]);
        setPhotosError("Mekan fotoğrafları şu an görüntülenemedi. Tekrar dene.");
      }
    }

    setPhotosLoading(false);
  }, [normalizedPlaceId]);

  useEffect(() => {
    void loadPlace();
  }, [loadPlace]);

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

  const sortedNotes = useMemo(() => {
    const copy = [...notes];

    return copy.sort((left, right) => {
      if (sortBy === "highest") {
        return Number(right?.Rating ?? 0) - Number(left?.Rating ?? 0);
      }

      if (sortBy === "lowest") {
        return Number(left?.Rating ?? 6) - Number(right?.Rating ?? 6);
      }

      return (
        new Date(right?.CreatedDate ?? 0).getTime() -
        new Date(left?.CreatedDate ?? 0).getTime()
      );
    });
  }, [notes, sortBy]);

  const ratings = notes
    .map((note) => Number(note?.Rating))
    .filter((rating) => Number.isInteger(rating) && rating >= 1 && rating <= 5);
  const averageRating =
    ratings.length > 0
      ? ratings.reduce((total, rating) => total + rating, 0) / ratings.length
      : null;
  const resolvedName =
    String(place?.Name ?? placeName ?? "").trim() || "Mekan";
  const resolvedCategoryCode =
    place?.VenueCategoryCode ?? venueCategoryCode ?? null;
  const resolvedCategoryLabel = getVenueCategoryLabel(resolvedCategoryCode);
  const resolvedCategoryIcon = getVenueCategoryIcon(resolvedCategoryCode);
  const hasMapCoordinates =
    Number.isFinite(Number(place?.Latitude)) &&
    Number.isFinite(Number(place?.Longitude));
  const visiblePhotoCount = Number(
    placePhotos[0]?.VisiblePhotoCount ?? placePhotos.length
  );
  const safePhotoCount = Number.isFinite(visiblePhotoCount)
    ? visiblePhotoCount
    : placePhotos.length;

  return (
    <div className="discovery-page-content place-detail-page">
      <header className="discovery-page-header place-detail-page-header">
        <button
          className="discovery-back-button"
          type="button"
          onClick={onBack}
          aria-label="Geri dön"
        >
          ‹
          <span>Geri</span>
        </button>

        <span className="place-detail-header-label">MEKAN</span>
      </header>

      <div className="discovery-page-body place-detail-page-body">
        {loading && <LoadingState compact />}

        {!loading && errorMessage && (
          <ErrorState message={errorMessage} onRetry={loadPlace} compact />
        )}

        {!loading && !errorMessage && place && (
          <>
            <section className="place-detail-hero">
              <div className="place-detail-category" title={resolvedCategoryLabel}>
                <span aria-hidden="true">{resolvedCategoryIcon}</span>
                {resolvedCategoryLabel}
              </div>

              <h1>{resolvedName}</h1>

              {place.FormattedAddress && (
                <p className="place-detail-address">{place.FormattedAddress}</p>
              )}

              <div className="place-detail-stat-row" aria-label="Mekan puanı, yorum ve fotoğraf sayısı">
                <div>
                  <strong>
                    {averageRating ? `${averageRating.toFixed(1)} / 5` : "Puan yok"}
                  </strong>
                  <span>{ratings.length > 0 ? `${ratings.length} puan` : "Henüz puanlanmadı"}</span>
                </div>
                <div>
                  <strong>{notes.length}</strong>
                  <span>yorum</span>
                </div>
                <div>
                  <strong>{photosLoading ? "…" : safePhotoCount}</strong>
                  <span>fotoğraf</span>
                </div>
              </div>

              <div className="place-detail-actions">
                <button
                  className="place-detail-map-button"
                  type="button"
                  onClick={() => onOpenPlaceOnMap?.(normalizedPlaceId)}
                  disabled={!hasMapCoordinates || !onOpenPlaceOnMap}
                >
                  Haritada aç
                </button>
                <button
                  className="place-detail-save-button"
                  type="button"
                  onClick={() => onOpenPlaceOnMap?.(normalizedPlaceId, "save")}
                  disabled={!onOpenPlaceOnMap}
                >
                  Kaydet
                </button>
              </div>

              <button
                className="place-detail-add-note-button"
                type="button"
                onClick={() => onOpenPlaceOnMap?.(normalizedPlaceId, "note")}
                disabled={!onOpenPlaceOnMap}
              >
                Bu mekana not ekle
              </button>
            </section>

            <PlacePhotoGallery
              photos={placePhotos}
              loading={photosLoading}
              errorMessage={photosError}
              onRetry={loadPlace}
              onOpenNote={onOpenNote}
            />

            <section className="place-detail-reviews" aria-label="Mekan yorumları">
              <div className="place-detail-reviews-heading">
                <div>
                  <p className="eyebrow">YORUMLAR</p>
                  <h2>Bu mekan hakkında</h2>
                </div>

                <div className="place-detail-sort" role="group" aria-label="Yorumları sırala">
                  <button
                    type="button"
                    className={sortBy === "newest" ? "place-detail-sort-active" : ""}
                    onClick={() => setSortBy("newest")}
                  >
                    Yeni
                  </button>
                  <button
                    type="button"
                    className={sortBy === "highest" ? "place-detail-sort-active" : ""}
                    onClick={() => setSortBy("highest")}
                  >
                    Yüksek
                  </button>
                  <button
                    type="button"
                    className={sortBy === "lowest" ? "place-detail-sort-active" : ""}
                    onClick={() => setSortBy("lowest")}
                  >
                    Düşük
                  </button>
                </div>
              </div>

              {notesLoading && <LoadingState compact />}

              {!notesLoading && notesError && (
                <ErrorState message={notesError} onRetry={loadPlace} compact />
              )}

              {!notesLoading && !notesError && sortedNotes.length === 0 && (
                <div className="place-detail-empty-reviews">
                  <span aria-hidden="true">✦</span>
                  <h3>Henüz yorum yok</h3>
                  <p>Bu mekanla ilgili ilk notu sen ekleyebilirsin.</p>
                </div>
              )}

              {!notesLoading && !notesError && sortedNotes.length > 0 && (
                <NoteFeed
                  notes={sortedNotes}
                  currentUserId={currentUserId}
                  onOpenPlace={onOpenPlaceOnMap}
                  onOpenUser={onOpenUser}
                  onOpenNote={onOpenNote}
                  placeLinkTitle="Mekanı haritada aç"
                />
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function PlacePhotoGallery({ photos, loading, errorMessage, onRetry, onOpenNote }) {
  if (loading) {
    return (
      <section className="place-detail-photo-section" aria-busy="true">
        <div className="place-detail-photo-heading">
          <div>
            <p className="eyebrow">FOTOĞRAFLAR</p>
            <h2>Mekandan kareler</h2>
          </div>
        </div>
        <p className="place-detail-photo-state">Fotoğraflar yükleniyor...</p>
      </section>
    );
  }

  if (errorMessage) {
    return (
      <section className="place-detail-photo-section">
        <div className="place-detail-photo-heading">
          <div>
            <p className="eyebrow">FOTOĞRAFLAR</p>
            <h2>Mekandan kareler</h2>
          </div>
        </div>
        <div className="place-detail-photo-error">
          <p>{errorMessage}</p>
          <button type="button" onClick={onRetry}>Tekrar dene</button>
        </div>
      </section>
    );
  }

  if (photos.length === 0) {
    return null;
  }

  return (
    <section className="place-detail-photo-section" aria-label="Mekan fotoğrafları">
      <div className="place-detail-photo-heading">
        <div>
          <p className="eyebrow">FOTOĞRAFLAR</p>
          <h2>Mekandan kareler</h2>
        </div>
        <span>{Number(photos[0]?.VisiblePhotoCount ?? photos.length)}</span>
      </div>

      <div className="place-detail-photo-grid">
        {photos.map((photo) => {
          const author = String(photo?.Username ?? "").trim();
          const title = String(photo?.NoteTitle ?? "").trim();
          const label = author ? `@${author}` : title || "Notu aç";

          return (
            <button
              className="place-detail-photo-tile"
              type="button"
              key={photo.PlaceNotePhotoId}
              onClick={() => onOpenNote?.(Number(photo.PlaceNoteId))}
              disabled={!photo.SignedUrl || !photo.PlaceNoteId || !onOpenNote}
              title={author ? `${label} notunu aç` : "Not detayını aç"}
            >
              <img
                src={photo.SignedUrl}
                alt={author ? `${author} kullanıcısının mekan fotoğrafı` : "Mekan fotoğrafı"}
              />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function NoteFeed({
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
  }, [noteIdsKey]);

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
                  {username.charAt(0).toUpperCase()}
                </button>
              ) : (
                <div className="note-feed-avatar" aria-hidden="true">
                  {username.charAt(0).toUpperCase()}
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

function NoteDetailPage({
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
  const [isPhotoManagerOpen, setIsPhotoManagerOpen] = useState(false);
  const actionMenuRef = useRef(null);

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

      if (isEditModalOpen || isPhotoManagerOpen) {
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
    isPhotoManagerOpen,
    onBack,
  ]);

  const username = note?.Username || "Kullanıcı";
  const fullName = getFullName(note);
  const avatarLetter = (username || fullName || "K").charAt(0).toUpperCase();
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

  const openPhotoManager = () => {
    if (!note || !isOwnNote || isDeleting) {
      return;
    }

    setIsActionMenuOpen(false);
    setIsPhotoManagerOpen(true);
  };

  const closePhotoManager = () => {
    setIsPhotoManagerOpen(false);
  };

  const handlePhotoManagerChanged = async () => {
    await loadNotePhotos();
    await Promise.resolve(onNoteUpdated?.());
  };

  const handleEditSave = async (nextValues) => {
    if (!note?.PlaceNoteId || !isOwnNote || isSavingEdit) {
      return;
    }

    setIsSavingEdit(true);
    setEditError("");

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
      setIsSavingEdit(false);
      return;
    }

    await loadNote();
    await Promise.resolve(onNoteUpdated?.());
    setIsSavingEdit(false);
    setIsEditModalOpen(false);
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
                {avatarLetter}
              </span>
              <span className="note-detail-page-author-copy">
                <strong>{fullName || username}</strong>
                <small>@{username}</small>
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
                    <button type="button" role="menuitem" onClick={openPhotoManager}>
                      Fotoğrafları yönet
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
            isSaving={isSavingEdit}
            errorMessage={editError}
            onCancel={closeEditModal}
            onSave={handleEditSave}
          />,
          document.body
        )}

      {isPhotoManagerOpen && note &&
        createPortal(
          <NotePhotoManagerModal
            noteId={Number(note.PlaceNoteId)}
            existingPhotos={notePhotos}
            onClose={closePhotoManager}
            onChanged={handlePhotoManagerChanged}
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

function NotePhotoGallery({ photos, loading, errorMessage, onRetry }) {
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

function NotePhotoManagerModal({ noteId, existingPhotos, onClose, onChanged }) {
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

function NoteEditModal({ note, isSaving, errorMessage, onCancel, onSave }) {
  const titleInputRef = useRef(null);
  const [form, setForm] = useState(() => ({
    title: String(note?.Title ?? "").trim(),
    rating: Number(note?.Rating) || 0,
    content: String(note?.Content ?? ""),
    visitedDate: toDateInputValue(note?.VisitedDate),
  }));
  const [hasAttemptedSave, setHasAttemptedSave] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
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

  useEffect(() => {
    titleInputRef.current?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleEscape = (event) => {
      if (event.key === "Escape" && !isSaving) {
        onCancel();
      }
    };

    window.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isSaving, onCancel]);

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleBackdropMouseDown = (event) => {
    if (!isSaving && event.target === event.currentTarget) {
      onCancel();
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    if (isSaving) {
      return;
    }

    if (!canSave) {
      setHasAttemptedSave(true);
      return;
    }

    onSave({
      title: form.title.trim(),
      rating: Number(form.rating),
      content: form.content.trim(),
      visitedDate: form.visitedDate || null,
    });
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
            disabled={isSaving}
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
              disabled={isSaving}
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
                  disabled={isSaving}
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
              disabled={isSaving}
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
              disabled={isSaving}
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

          {errorMessage && (
            <p className="note-edit-modal-error" role="alert">
              {errorMessage}
            </p>
          )}

          <div className="note-edit-modal-actions">
            <button
              className="note-edit-modal-cancel"
              type="button"
              disabled={isSaving}
              onClick={onCancel}
            >
              Vazgeç
            </button>
            <button
              className={`note-edit-modal-save${
                canSave ? "" : " note-edit-modal-save-incomplete"
              }`}
              type="submit"
              disabled={isSaving}
              aria-disabled={!canSave || isSaving}
            >
              {isSaving ? "Kaydediliyor..." : "Değişiklikleri kaydet"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function NoteDeleteConfirmModal({
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
      <p>{t(message)}</p>
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
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");

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

export default App;
