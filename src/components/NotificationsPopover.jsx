import { useEffect, useMemo, useRef, useState } from "react";
import AppIcon from "./AppIcon.jsx";
import {
  getErrorMessageKey,
  MESSAGE_KEY,
  t,
} from "../i18n/messages.js";
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

function isNoteNotificationType(typeCode) {
  return [
    "FOLLOWING_NOTE",
    "NOTE_REACTION_UP",
    "NOTE_REACTION_DOWN",
  ].includes(typeCode);
}

function isFriendNotificationType(typeCode) {
  return [
    "COLLECTION_COLLABORATOR_ADDED",
    "COLLECTION_PLACE_ADDED",
  ].includes(typeCode);
}

function getNoteNotificationCopy(notification) {
  const actor = notification?.ActorUsername || "Bir kullanıcı";

  switch (notification?.NotificationTypeCode) {
    case "NOTE_REACTION_UP":
      return {
        icon: "thumbs-up-fill",
        title: `${actor} notunu beğendi.`,
        detail: notification?.PlaceName || "Notunu görmek için dokun.",
      };

    case "NOTE_REACTION_DOWN":
      return {
        icon: "thumbs-down-fill",
        title: `${actor} notunu beğenmedi.`,
        detail: notification?.PlaceName || "Notunu görmek için dokun.",
      };

    case "COLLECTION_COLLABORATOR_ADDED":
      return {
        icon: "bookmarks-fill",
        title: `${actor} seni bir listeye ekledi.`,
        detail: notification?.UserPlaceListName || "Ortak koleksiyonu görmek için dokun.",
      };

    case "COLLECTION_PLACE_ADDED":
      return {
        icon: "map-pin-fill",
        title: `${actor} ortak koleksiyona yeni bir mekan ekledi.`,
        detail: notification?.UserPlaceListName || "Koleksiyonu görmek için dokun.",
      };

    case "FOLLOWING_NOTE":
    default:
      return {
        icon: "star-fill",
        title: `${actor} yeni bir not ekledi.`,
        detail: notification?.PlaceName || "Takip ettiğin bir mekânda.",
      };
  }
}

function getFollowActivityCopy(activity) {
  const actor = activity?.ActorUsername || "Bir kullanıcı";

  switch (activity?.ActivityTypeCode) {
    case "FOLLOW_REQUEST":
      return {
        icon: "user-circle-plus",
        title: `${actor} sana takip isteği gönderdi.`,
        detail: "İsteği kabul edebilir veya reddedebilirsin.",
      };
    case "FOLLOW_REQUEST_ACCEPTED":
      return {
        icon: "check",
        title: `${actor} takip isteğini kabul etti.`,
        detail: "Artık bu hesabın notlarını ve takip listelerini görebilirsin.",
      };
    case "FOLLOWED":
    default:
      return {
        icon: "user-fill",
        title: `${actor} seni takip etmeye başladı.`,
        detail: "Profilini görmek için dokun.",
      };
  }
}


function getContentShareCopy(share) {
  const actor = share?.SenderUsername || "Bir kullanıcı";
  const message = String(share?.Message ?? "").trim();
  const targetTitle = String(share?.TargetTitle ?? "İçerik").trim() || "İçerik";

  const typeCopy = {
    PLACE: { icon: "storefront-fill", label: "bir mekan" },
    NOTE: { icon: "star-fill", label: "bir not" },
    COLLECTION: { icon: "bookmarks-fill", label: "bir koleksiyon" },
    PROFILE: { icon: "user-fill", label: "bir profil" },
  }[String(share?.ShareTypeCode ?? "").toUpperCase()] ?? {
    icon: "share-fat-fill",
    label: "bir içerik",
  };

  return {
    icon: typeCopy.icon,
    title: `${actor} sana ${typeCopy.label} gönderdi.`,
    detail: message || targetTitle,
  };
}

function BellIcon({ hasUnread = false }) {
  return <AppIcon name={hasUnread ? "bell-ringing" : "bell"} />;
}

export default function NotificationsPopover({
  isOpen = false,
  notifications = [],
  followActivity = [],
  contentShares = [],
  isLoading = false,
  followActivityLoading = false,
  contentSharesLoading = false,
  errorMessage = "",
  followActivityError = "",
  contentSharesError = "",
  unreadCount = 0,
  onToggle = () => {},
  onRetryNotifications = () => {},
  onRetryFollowActivity = () => {},
  onRetryContentShares = () => {},
  onFollowActivityViewed = () => {},
  onContentSharesViewed = () => {},
  onOpenNotification = () => {},
  onOpenContentShare = () => {},
  onRespondToRequest = null,
}) {
  const menuRef = useRef(null);
  const [activeTab, setActiveTab] = useState("notes");
  const [processingFollowerUserId, setProcessingFollowerUserId] = useState(null);
  const [actionError, setActionError] = useState("");

  const safeFollowActivity = useMemo(
    () => (Array.isArray(followActivity) ? followActivity : []),
    [followActivity]
  );
  const safeContentShares = useMemo(
    () => (Array.isArray(contentShares) ? contentShares : []),
    [contentShares]
  );
  const safeUnreadCount = Number(unreadCount) || 0;

  const noteNotifications = useMemo(
    () =>
      (Array.isArray(notifications) ? notifications : []).filter((notification) =>
        isNoteNotificationType(notification?.NotificationTypeCode)
      ),
    [notifications]
  );

  const friendNotifications = useMemo(
    () =>
      (Array.isArray(notifications) ? notifications : []).filter((notification) =>
        isFriendNotificationType(notification?.NotificationTypeCode)
      ),
    [notifications]
  );

  const pendingFollowRequests = useMemo(
    () => safeFollowActivity.filter((activity) => Boolean(activity?.CanRespond)),
    [safeFollowActivity]
  );

  const friendActivity = useMemo(
    () => safeFollowActivity.filter((activity) => !activity?.CanRespond),
    [safeFollowActivity]
  );

  const friendUnreadCount = useMemo(
    () =>
      safeFollowActivity.filter((activity) => !activity?.IsRead).length +
      friendNotifications.filter((notification) => !notification?.IsRead).length,
    [safeFollowActivity, friendNotifications]
  );

  const contentShareUnreadCount = useMemo(
    () => safeContentShares.filter((share) => !share?.IsRead).length,
    [safeContentShares]
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
      setActionError(MESSAGE_KEY.FOLLOW_REQUEST_INVALID);
      return;
    }

    setActionError("");
    setProcessingFollowerUserId(actorUserId);

    try {
      await onRespondToRequest(activity, accept);
    } catch (error) {
      console.error("Takip isteği yanıtlanamadı:", error);
      setActionError(
        getErrorMessageKey(error, MESSAGE_KEY.FOLLOW_REQUEST_RESPONSE_FAILED)
      );
    } finally {
      setProcessingFollowerUserId(null);
    }
  };

  const handleTabChange = (nextTab) => {
    if (nextTab === activeTab) {
      return;
    }

    setActiveTab(nextTab);

    if (nextTab === "friends") {
      void onFollowActivityViewed();
    } else if (nextTab === "shares") {
      void onContentSharesViewed();
    }
  };

  const isFriendsTab = activeTab === "friends";
  const isSharesTab = activeTab === "shares";
  const visibleItems = isFriendsTab
    ? [...friendActivity, ...friendNotifications].sort(
        (left, right) =>
          new Date(right?.CreatedDate || 0).getTime() -
          new Date(left?.CreatedDate || 0).getTime()
      )
    : isSharesTab
      ? safeContentShares
      : noteNotifications;
  const isCurrentTabLoading = isFriendsTab
    ? followActivityLoading || isLoading
    : isSharesTab
      ? contentSharesLoading
      : isLoading;
  const currentTabError = isFriendsTab
    ? followActivityError || errorMessage
    : isSharesTab
      ? contentSharesError
      : errorMessage;
  const friendBadgeLabel = friendUnreadCount > 99 ? "99+" : String(friendUnreadCount);
  const contentShareBadgeLabel = contentShareUnreadCount > 99
    ? "99+"
    : String(contentShareUnreadCount);
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
        <BellIcon hasUnread={safeUnreadCount > 0} />
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
              <h2>Gelişmeler</h2>
            </div>
            {safeUnreadCount > 0 && (
              <span className="notification-read-status">
                {`${safeUnreadCount > 9 ? "9+" : safeUnreadCount} yeni bildirim`}
              </span>
            )}
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
              className={activeTab === "friends" ? "notification-tab-active" : ""}
              type="button"
              role="tab"
              aria-selected={activeTab === "friends"}
              onClick={() => handleTabChange("friends")}
            >
              Arkadaşların
              {friendUnreadCount > 0 && (
                <span
                  className="notification-tab-count"
                  aria-label={`${friendBadgeLabel} yeni arkadaş hareketi`}
                >
                  {friendBadgeLabel}
                </span>
              )}
            </button>

            <button
              className={activeTab === "shares" ? "notification-tab-active" : ""}
              type="button"
              role="tab"
              aria-selected={activeTab === "shares"}
              onClick={() => handleTabChange("shares")}
            >
              Paylaşımlar
              {contentShareUnreadCount > 0 && (
                <span
                  className="notification-tab-count"
                  aria-label={`${contentShareBadgeLabel} yeni paylaşım`}
                >
                  {contentShareBadgeLabel}
                </span>
              )}
            </button>
          </div>

          <div className="notification-popover-body" role="tabpanel">
              <>
                {isFriendsTab && pendingFollowRequests.length > 0 && (
                  <div className="notification-list" aria-label="Bekleyen takip istekleri">
                    {pendingFollowRequests.map((activity) => {
                      const copy = getFollowActivityCopy(activity);
                      const actorUserId = Number(activity?.ActorUserId);
                      const isProcessing =
                        Number.isInteger(actorUserId) &&
                        processingFollowerUserId === actorUserId;

                      return (
                        <article
                          className="notification-item"
                          key={activity?.ActivityId || `request-${actorUserId}-${activity?.CreatedDate}`}
                        >
                          <button
                            className={`notification-item-main${
                              !activity?.IsRead ? " notification-item-unread" : ""
                            }`}
                            type="button"
                            onClick={() => onOpenNotification(activity)}
                          >
                            <span className="notification-item-icon" aria-hidden="true">
                              <AppIcon name={copy.icon} />
                            </span>
                            <span className="notification-item-copy">
                              <strong>{copy.title}</strong>
                              <span className="notification-item-detail">{copy.detail}</span>
                              <time dateTime={activity?.CreatedDate}>
                                {formatNotificationTime(activity?.CreatedDate)}
                              </time>
                            </span>
                          </button>
                          <div className="notification-request-actions">
                            <button
                              className="notification-request-accept"
                              type="button"
                              onClick={(event) => handleRequestResponse(event, activity, true)}
                              disabled={isProcessing}
                            >
                              {isProcessing ? "İşleniyor..." : "Kabul et"}
                            </button>
                            <button
                              className="notification-request-reject"
                              type="button"
                              onClick={(event) => handleRequestResponse(event, activity, false)}
                              disabled={isProcessing}
                            >
                              Reddet
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}

                {isCurrentTabLoading && (
                  <p className="notification-state">Yükleniyor...</p>
                )}

                {!isCurrentTabLoading && currentTabError && (
                  <div className="notification-state notification-state-error">
                    <p>{t(currentTabError)}</p>
                    <button
                      type="button"
                      onClick={() =>
                        isFriendsTab
                          ? onRetryFollowActivity()
                          : isSharesTab
                            ? onRetryContentShares()
                            : onRetryNotifications()
                      }
                    >
                      Tekrar dene
                    </button>
                  </div>
                )}

                {!isCurrentTabLoading &&
                  !currentTabError &&
                  visibleItems.length === 0 &&
                  !(isFriendsTab && pendingFollowRequests.length > 0) && (
                    <div className="notification-state">
                      <span className="notification-empty-icon" aria-hidden="true">
                        <AppIcon name={isFriendsTab ? "user" : isSharesTab ? "share-fat" : "bell"} />
                      </span>
                      <p>
                        {isFriendsTab
                          ? "Henüz arkadaş hareketin yok."
                          : isSharesTab
                            ? "Henüz sana gönderilen bir içerik yok."
                            : "Yeni not bildirimin yok."}
                      </p>
                    </div>
                  )}

                {!isCurrentTabLoading &&
                  !currentTabError &&
                  visibleItems.length > 0 && (
                    <div className="notification-list">
                      {visibleItems.map((item) => {
                        const isCollectionNotification = Boolean(item?.NotificationTypeCode);
                        const copy = isFriendsTab
                          ? isCollectionNotification
                            ? getNoteNotificationCopy(item)
                            : getFollowActivityCopy(item)
                          : isSharesTab
                            ? getContentShareCopy(item)
                            : getNoteNotificationCopy(item);
                        const actorUserId = Number(
                          isSharesTab ? item?.SenderUserId : item?.ActorUserId
                        );
                        const canRespond = Boolean(item?.CanRespond);
                        const isProcessing =
                          canRespond &&
                          Number.isInteger(actorUserId) &&
                          processingFollowerUserId === actorUserId;
                        const itemKey = isFriendsTab
                          ? item?.NotificationId || item?.ActivityId || `friend-${actorUserId}-${item?.CreatedDate}`
                          : isSharesTab
                            ? item?.ContentShareId || `share-${actorUserId}-${item?.CreatedDate}`
                            : item?.NotificationId || item?.CreatedDate;

                        return (
                          <article className="notification-item" key={itemKey}>
                            <button
                              className={`notification-item-main${
                                !item?.IsRead ? " notification-item-unread" : ""
                              }`}
                              type="button"
                              onClick={() => {
                                if (isSharesTab) {
                                  onOpenContentShare(item);
                                } else {
                                  onOpenNotification(item);
                                }
                              }}
                            >
                              <span
                                className="notification-item-icon"
                                aria-hidden="true"
                              >
                                <AppIcon name={copy.icon} />
                              </span>

                              <span className="notification-item-copy">
                                <strong>{copy.title}</strong>
                                {copy.detail && (
                                  <span
                                    className={
                                      isSharesTab
                                        ? "notification-item-detail notification-item-detail-full"
                                        : "notification-item-detail"
                                    }
                                  >
                                    {copy.detail}
                                  </span>
                                )}
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
                  <p className="notification-action-error">{t(actionError)}</p>
                )}
              </>
          </div>
        </section>
      )}
    </div>
  );
}
