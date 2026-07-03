/*
 * Refactored from the application root.
 * This feature module intentionally keeps existing UI behavior intact.
 */

import { MESSAGE_KEY } from "../../i18n/messages.js";
import { supabase } from "../../supabase.js";
import { useCallback, useEffect, useRef, useState } from "react";

export const EMPTY_SUMMARY = {
  CityName: "",
  FollowerCount: 0,
  FollowingCount: 0,
  NoteCount: 0,
};

export const SILENT_NOTIFICATION_REFRESH_INTERVAL_MS = 60_000;

export const PROFILE_COLLECTIONS = {
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

export const PROFILE_TAB_IDS = Object.freeze({
  NOTES: "notes",
  PHOTOS: "photos",
  SAVED: "saved",
});

export const EMPTY_NOTE_REACTION_SUMMARY = Object.freeze({
  UpCount: 0,
  DownCount: 0,
  MyReactionCode: null,
});

export const BOTTOM_NAV_ITEMS = Object.freeze([
  { id: "map", label: "Harita", icon: "⌖" },
  { id: "list", label: "Liste", icon: "☷" },
  { id: "profile", label: "Profil", icon: "◉" },
]);

export function formatDate(value, options = { day: "numeric", month: "long", year: "numeric" }) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("tr-TR", options).format(date);
}

export function toDateInputValue(value) {
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

export function formatRelativeNoteTime(value) {
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

export function getNoteTitle(note) {
  return String(note?.Title ?? "").trim() || "Başlıksız not";
}

export function formatNoteRating(value) {
  const rating = Number(value);

  return Number.isInteger(rating) && rating >= 1 && rating <= 5
    ? `${rating} / 5`
    : "Puanlanmadı";
}

export function ReadOnlyRatingStars({ value }) {
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

export function normalizeReactionSummary(value) {
  const code = String(value?.MyReactionCode ?? "").trim().toUpperCase();

  return {
    UpCount: Math.max(0, Number(value?.UpCount) || 0),
    DownCount: Math.max(0, Number(value?.DownCount) || 0),
    MyReactionCode: code === "UP" || code === "DOWN" ? code : null,
  };
}

export function getReactionNoteId(note) {
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

export function getReactionSummaryRows(payload) {
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

export function NoteReactionControls({
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

export function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="10.8" cy="10.8" r="5.8" />
      <path d="m15.2 15.2 4 4" />
    </svg>
  );
}

export function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 8.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2Z" />
      <path d="m19.4 13.3 1.2.9-1.8 3.1-1.5-.6a7.7 7.7 0 0 1-1.7 1l-.2 1.6h-3.6l-.2-1.6a7.7 7.7 0 0 1-1.7-1l-1.5.6-1.8-3.1 1.2-.9a7.2 7.2 0 0 1 0-2.6L7.6 9.8l1.8-3.1 1.5.6a7.7 7.7 0 0 1 1.7-1l.2-1.6h3.6l.2 1.6a7.7 7.7 0 0 1 1.7 1l1.5-.6 1.8 3.1-1.2.9a7.2 7.2 0 0 1 0 2.6Z" />
    </svg>
  );
}

export function getFullName(user) {
  return [user?.FirstName, user?.LastName].filter(Boolean).join(" ");
}

export function isIOSDevice() {
  if (typeof navigator === "undefined") {
    return false;
  }

  const userAgent = navigator.userAgent || "";

  return (
    /iPad|iPhone|iPod/.test(userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function getBottomNavIndex(pageId) {
  const index = BOTTOM_NAV_ITEMS.findIndex((item) => item.id === pageId);

  return index >= 0 ? index : 0;
}

export function BottomNavigation({ activePage, onNavigate, liquidGlassEnabled }) {
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

export function createDiscoveryScreenId(type) {
  return `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function isPrivateAccount(value) {
  return String(value ?? "").trim().toUpperCase() === "PRIVATE";
}

export function renderUsernameWithLock(username, isPrivate) {
  const normalizedUsername = String(username ?? "").trim();

  return isPrivate && normalizedUsername
    ? `${normalizedUsername} 🔒`
    : normalizedUsername;
}
