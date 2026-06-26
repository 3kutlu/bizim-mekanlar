import { useEffect, useMemo, useRef, useState } from "react";
import "../css/notifications.css";

function formatNotificationTime(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const diffInSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const relative = new Intl.RelativeTimeFormat("tr", { numeric: "auto" });
  const absoluteSeconds = Math.abs(diffInSeconds);

  if (absoluteSeconds < 60) {
    return "Şimdi";
  }

  if (absoluteSeconds < 60 * 60) {
    return relative.format(Math.round(diffInSeconds / 60), "minute");
  }

  if (absoluteSeconds < 60 * 60 * 24) {
    return relative.format(Math.round(diffInSeconds / (60 * 60)), "hour");
  }

  if (absoluteSeconds < 60 * 60 * 24 * 7) {
    return relative.format(
      Math.round(diffInSeconds / (60 * 60 * 24)),
      "day"
    );
  }

  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "short",
  }).format(date);
}

function getNoteNotificationCopy(notification) {
  const actor = notification?.ActorUsername || "Bir kullanıcı";

  return {
    icon: "✦",
    title: `${actor} yeni bir not ekledi.`,
    detail: notification?.PlaceName || "Takip ettiğin bir mekânda.",
  };
}

function getFollowActivityCopy(activity) {
  const actor = activity?.ActorUsername || "Bir kullanıcı";

  switch (activity?.ActivityTypeCode) {
    case "FOLLOW_REQUEST":
      return {
        icon: "⌁",
        title: `${actor} sana takip isteği gönderdi.`,
        detail: "İsteği kabul edebilir veya reddedebilirsin.",
      };
    case "FOLLOW_REQUEST_ACCEPTED":
      return {
        icon: "✓",
        title: `${actor} takip isteğini kabul etti.`,
        detail: "Artık bu hesabın notlarını ve takip listelerini görebilirsin.",
      };
    case "FOLLOWED":
    default:
      return {
        icon: "◉",
        title: `${actor} seni takip etmeye başladı.`,
        detail: "Profilini görmek için dokun.",
      };
  }
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M18 9a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
    </svg>
  );
}

export default function NotificationsPopover({
  isOpen = false,
  notifications = [],
  followActivity = [],
  isLoading = false,
  followActivityLoading = false,
  errorMessage = "",
  followActivityError = "",
  unreadCount = 0,
  onToggle = () => {},
  onRetryNotifications = () => {},
  onRetryFollowActivity = () => {},
  onFollowActivityViewed = () => {},
  onOpenNotification = () => {},
  onRespondToRequest = null,
}) {
  const menuRef = useRef(null);
  const [activeTab, setActiveTab] = useState("notes");
  const [processingFollowerUserId, setProcessingFollowerUserId] = useState(null);
  const [actionError, setActionError] = useState("");

  const safeNotifications = Array.isArray(notifications) ? notifications : [];
  const safeFollowActivity = Array.isArray(followActivity) ? followActivity : [];
  const safeUnreadCount = Number(unreadCount) || 0;

  const noteNotifications = useMemo(
    () =>
      safeNotifications.filter(
        (notification) => notification?.NotificationTypeCode === "FOLLOWING_NOTE"
      ),
    [safeNotifications]
  );

  const followUnreadCount = useMemo(
    () => safeFollowActivity.filter((activity) => !activity?.IsRead).length,
    [safeFollowActivity]
  );

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const closeOnOutsidePointer = (event) => {
      if (!menuRef.current?.contains(event.target)) {
        void onToggle();
      }
    };

    const closeOnEscape = (event) => {
      if (event.key === "Escape") {
        void onToggle();
      }
    };

    window.addEventListener("pointerdown", closeOnOutsidePointer);
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      window.removeEventListener("pointerdown", closeOnOutsidePointer);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen, onToggle]);

  useEffect(() => {
    if (!isOpen) {
      setActiveTab("notes");
      setActionError("");
      setProcessingFollowerUserId(null);
    }
  }, [isOpen]);

  const handleRequestResponse = async (event, activity, accept) => {
    event.stopPropagation();

    if (!onRespondToRequest || processingFollowerUserId) {
      return;
    }

    const actorUserId = Number(activity?.ActorUserId);

    if (!Number.isInteger(actorUserId) || actorUserId <= 0) {
      setActionError("Takip isteği bilgisi geçersiz.");
      return;
    }

    setActionError("");
    setProcessingFollowerUserId(actorUserId);

    try {
      await onRespondToRequest(activity, accept);
    } catch (error) {
      console.error("Takip isteği yanıtlanamadı:", error);
      setActionError(error?.message || "Takip isteği yanıtlanamadı.");
    } finally {
      setProcessingFollowerUserId(null);
    }
  };

  const handleTabChange = (nextTab) => {
    if (nextTab === activeTab) {
      return;
    }

    setActiveTab(nextTab);

    if (nextTab === "follow") {
      void onFollowActivityViewed();
    }
  };

  const isFollowTab = activeTab === "follow";
  const visibleItems = isFollowTab ? safeFollowActivity : noteNotifications;
  const isCurrentTabLoading = isFollowTab
    ? followActivityLoading
    : isLoading;
  const currentTabError = isFollowTab ? followActivityError : errorMessage;
  const followBadgeLabel = followUnreadCount > 99 ? "99+" : String(followUnreadCount);
  const bellBadgeLabel = safeUnreadCount > 9 ? "9+" : String(safeUnreadCount);

  return (
    <div className="notification-menu" ref={menuRef}>
      <button
        className="notification-trigger"
        type="button"
        onClick={() => void onToggle()}
        aria-label={
          safeUnreadCount > 0
            ? `${safeUnreadCount} yeni gelişme`
            : "Gelişmeler"
        }
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        title="Gelişmeler"
      >
        <BellIcon />
        {safeUnreadCount > 0 && (
          <span
            className="notification-count"
            aria-label={`${bellBadgeLabel} yeni`}
          >
            {bellBadgeLabel}
          </span>
        )}
      </button>

      {isOpen && (
        <section
          className="notification-popover"
          role="dialog"
          aria-modal="false"
          aria-label="Gelişmeler"
        >
          <header className="notification-popover-header">
            <div>
              <p className="eyebrow">HESABIN</p>
              <h2>Gelişmeler</h2>
            </div>
            <span className="notification-read-status">
              {safeUnreadCount > 0
                ? `${safeUnreadCount > 9 ? "9+" : safeUnreadCount} yeni`
                : "Güncel"}
            </span>
          </header>

          <div
            className="notification-tabs"
            role="tablist"
            aria-label="Gelişme kategorileri"
          >
            <button
              className={activeTab === "notes" ? "notification-tab-active" : ""}
              type="button"
              role="tab"
              aria-selected={activeTab === "notes"}
              onClick={() => handleTabChange("notes")}
            >
              Notlar
            </button>

            <button
              className={activeTab === "follow" ? "notification-tab-active" : ""}
              type="button"
              role="tab"
              aria-selected={activeTab === "follow"}
              onClick={() => handleTabChange("follow")}
            >
              Takip
              {followUnreadCount > 0 && (
                <span
                  className="notification-tab-count"
                  aria-label={`${followBadgeLabel} yeni takip hareketi`}
                >
                  {followBadgeLabel}
                </span>
              )}
            </button>
          </div>

          <div className="notification-popover-body" role="tabpanel">
            {isCurrentTabLoading && (
              <p className="notification-state">Yükleniyor...</p>
            )}

            {!isCurrentTabLoading && currentTabError && (
              <div className="notification-state notification-state-error">
                <p>{currentTabError}</p>
                <button
                  type="button"
                  onClick={() =>
                    isFollowTab
                      ? onRetryFollowActivity()
                      : onRetryNotifications()
                  }
                >
                  Tekrar dene
                </button>
              </div>
            )}

            {!isCurrentTabLoading &&
              !currentTabError &&
              visibleItems.length === 0 && (
                <div className="notification-state">
                  <span className="notification-empty-icon" aria-hidden="true">
                    {isFollowTab ? "◉" : "✦"}
                  </span>
                  <p>
                    {isFollowTab
                      ? "Henüz takip hareketin yok."
                      : "Yeni not bildirimin yok."}
                  </p>
                </div>
              )}

            {!isCurrentTabLoading &&
              !currentTabError &&
              visibleItems.length > 0 && (
                <div className="notification-list">
                  {visibleItems.map((item) => {
                    const copy = isFollowTab
                      ? getFollowActivityCopy(item)
                      : getNoteNotificationCopy(item);
                    const actorUserId = Number(item?.ActorUserId);
                    const canRespond = Boolean(item?.CanRespond);
                    const isProcessing =
                      canRespond &&
                      Number.isInteger(actorUserId) &&
                      processingFollowerUserId === actorUserId;
                    const itemKey = isFollowTab
                      ? item?.ActivityId || `follow-${actorUserId}-${item?.CreatedDate}`
                      : item?.NotificationId || item?.CreatedDate;

                    return (
                      <article className="notification-item" key={itemKey}>
                        <button
                          className={`notification-item-main${
                            !item?.IsRead ? " notification-item-unread" : ""
                          }`}
                          type="button"
                          onClick={() => onOpenNotification(item)}
                        >
                          <span
                            className="notification-item-icon"
                            aria-hidden="true"
                          >
                            {copy.icon}
                          </span>

                          <span className="notification-item-copy">
                            <strong>{copy.title}</strong>
                            {copy.detail && <span>{copy.detail}</span>}
                            <time dateTime={item?.CreatedDate}>
                              {formatNotificationTime(item?.CreatedDate)}
                            </time>
                          </span>
                        </button>

                        {canRespond && (
                          <div className="notification-request-actions">
                            <button
                              className="notification-request-accept"
                              type="button"
                              onClick={(event) =>
                                handleRequestResponse(event, item, true)
                              }
                              disabled={isProcessing}
                            >
                              {isProcessing ? "İşleniyor..." : "Kabul et"}
                            </button>
                            <button
                              className="notification-request-reject"
                              type="button"
                              onClick={(event) =>
                                handleRequestResponse(event, item, false)
                              }
                              disabled={isProcessing}
                            >
                              Reddet
                            </button>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}

            {actionError && (
              <p className="notification-action-error">{actionError}</p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
