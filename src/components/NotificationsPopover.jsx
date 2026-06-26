import { useEffect, useRef, useState } from "react";
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
    return relative.format(Math.round(diffInSeconds / (60 * 60 * 24)), "day");
  }

  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "short",
  }).format(date);
}

function getNotificationCopy(notification) {
  const actor = notification.ActorUsername || "Bir kullanıcı";

  switch (notification.NotificationTypeCode) {
    case "FOLLOWED":
      return {
        icon: "◉",
        title: `${actor} seni takip etmeye başladı.`,
        detail: "Profilini görmek için dokun.",
      };
    case "FOLLOW_REQUEST":
      return {
        icon: "⌁",
        title: `${actor} sana takip isteği gönderdi.`,
        detail: "İsteği kabul edebilir veya reddedebilirsin.",
      };
    case "FOLLOWING_NOTE":
      return {
        icon: "✦",
        title: `${actor} yeni bir not ekledi.`,
        detail: notification.PlaceName || "Takip ettiğin bir mekânda.",
      };
    default:
      return {
        icon: "•",
        title: "Yeni bir bildirimin var.",
        detail: "",
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
  isOpen,
  notifications,
  isLoading,
  errorMessage,
  unreadCount,
  onToggle,
  onRetry,
  onOpenNotification,
  onRespondToRequest,
}) {
  const menuRef = useRef(null);
  const [processingNotificationId, setProcessingNotificationId] = useState(null);
  const [actionError, setActionError] = useState("");

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
      setActionError("");
      setProcessingNotificationId(null);
    }
  }, [isOpen]);

  const handleRequestResponse = async (event, notification, accept) => {
    event.stopPropagation();

    if (!onRespondToRequest || processingNotificationId) {
      return;
    }

    setActionError("");
    setProcessingNotificationId(notification.NotificationId);

    try {
      await onRespondToRequest(notification, accept);
    } catch (error) {
      console.error("Takip isteği yanıtlanamadı:", error);
      setActionError(error?.message || "Takip isteği yanıtlanamadı.");
    } finally {
      setProcessingNotificationId(null);
    }
  };

  const badgeLabel = unreadCount > 9 ? "9+" : String(unreadCount);

  return (
    <div className="notification-menu" ref={menuRef}>
      <button
        className="notification-trigger"
        type="button"
        onClick={() => void onToggle()}
        aria-label={
          unreadCount > 0
            ? `${unreadCount} okunmamış bildirim`
            : "Bildirimler"
        }
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        title="Bildirimler"
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span className="notification-count" aria-label={`${badgeLabel} yeni bildirim`}>
            {badgeLabel}
          </span>
        )}
      </button>

      {isOpen && (
        <section
          className="notification-popover"
          role="dialog"
          aria-modal="false"
          aria-label="Bildirimler"
        >
          <header className="notification-popover-header">
            <div>
              <p className="eyebrow">HESABIN</p>
              <h2>Bildirimler</h2>
            </div>
            <span className="notification-read-status">
              {unreadCount > 0 ? `${unreadCount > 9 ? "9+" : unreadCount} yeni` : "Hepsi okundu"}
            </span>
          </header>

          <div className="notification-popover-body">

            {isLoading && <p className="notification-state">Yükleniyor...</p>}

            {!isLoading && errorMessage && (
              <div className="notification-state notification-state-error">
                <p>{errorMessage}</p>
                <button type="button" onClick={onRetry}>
                  Tekrar dene
                </button>
              </div>
            )}

            {!isLoading && !errorMessage && notifications.length === 0 && (
              <div className="notification-state">
                <span className="notification-empty-icon" aria-hidden="true">
                  ✦
                </span>
                <p>Yeni bildirimin yok.</p>
              </div>
            )}

            {!isLoading && !errorMessage && notifications.length > 0 && (
              <div className="notification-list">
                {notifications.map((notification) => {
                  const copy = getNotificationCopy(notification);
                  const isProcessing =
                    processingNotificationId === notification.NotificationId;
                  const isRequest =
                    notification.NotificationTypeCode === "FOLLOW_REQUEST";

                  return (
                    <article
                      className={`notification-item${
                        notification.IsRead ? "" : " notification-item-unread"
                      }`}
                      key={notification.NotificationId}
                    >
                      <button
                        className="notification-item-main"
                        type="button"
                        onClick={() => onOpenNotification?.(notification)}
                      >
                        <span className="notification-item-icon" aria-hidden="true">
                          {copy.icon}
                        </span>

                        <span className="notification-item-copy">
                          <strong>{copy.title}</strong>
                          {copy.detail && <span>{copy.detail}</span>}
                          <time dateTime={notification.CreatedDate}>
                            {formatNotificationTime(notification.CreatedDate)}
                          </time>
                        </span>
                      </button>

                      {isRequest && (
                        <div className="notification-request-actions">
                          <button
                            className="notification-request-accept"
                            type="button"
                            onClick={(event) =>
                              handleRequestResponse(event, notification, true)
                            }
                            disabled={isProcessing}
                          >
                            {isProcessing ? "İşleniyor..." : "Kabul et"}
                          </button>
                          <button
                            className="notification-request-reject"
                            type="button"
                            onClick={(event) =>
                              handleRequestResponse(event, notification, false)
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

            {actionError && <p className="notification-action-error">{actionError}</p>}
          </div>
        </section>
      )}
    </div>
  );
}
