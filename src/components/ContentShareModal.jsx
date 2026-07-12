import { useEffect, useMemo, useRef, useState } from "react";
import AppIcon from "./AppIcon.jsx";
import { supabase } from "../supabase.js";
import { useProfilePhotoUrls } from "../utils/profilePhotos.js";
import {
  filterUnavailableUsers,
  getMyUnavailableUserIds,
} from "../utils/userRelationships.js";
import "../css/content-sharing.css";

const SHARE_TYPE_COPY = Object.freeze({
  PLACE: { icon: "storefront-fill", label: "Mekan" },
  NOTE: { icon: "star-fill", label: "Not" },
  COLLECTION: { icon: "bookmarks-fill", label: "Koleksiyon" },
  PROFILE: { icon: "user-fill", label: "Profil" },
});

function getFullName(user) {
  return [user?.FirstName, user?.LastName].filter(Boolean).join(" ");
}

function normalizeQuery(value) {
  return String(value ?? "").trim().toLocaleLowerCase("tr-TR");
}

export default function ContentShareModal({
  share,
  currentUserId,
  onClose,
  onExternalShare,
  onCopyLink,
  onSent,
}) {
  const [mode, setMode] = useState("recipients");
  const [recipients, setRecipients] = useState([]);
  const [recipientsLoading, setRecipientsLoading] = useState(false);
  const [recipientsError, setRecipientsError] = useState("");
  const [recipientShareStats, setRecipientShareStats] = useState({});
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [sendingUserId, setSendingUserId] = useState(null);
  const [sentUserIds, setSentUserIds] = useState(() => new Set());
  const [sendError, setSendError] = useState("");
  const searchInputRef = useRef(null);
  const profilePhotoUrls = useProfilePhotoUrls(
    recipients.map((user) => user?.UserId)
  );

  const shareTypeCopy = SHARE_TYPE_COPY[share?.typeCode] ?? SHARE_TYPE_COPY.PLACE;

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !sendingUserId) {
        if (mode === "recipients") {
          setMode("actions");
          setSendError("");
        } else {
          onClose();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mode, onClose, sendingUserId]);

  useEffect(() => {
    if (mode !== "recipients") {
      return undefined;
    }

    searchInputRef.current?.focus();
    let isCurrent = true;

    const loadRecipients = async () => {
      setRecipientsLoading(true);
      setRecipientsError("");

      const [connectionsResult, shareHistoryResult] = await Promise.all([
        supabase.rpc("GetProfileConnections", {
          p_profile_user_id: Number(currentUserId),
          p_list_type: "FOLLOWING",
        }),
        supabase
          .from("ContentShares")
          .select("RecipientUserId, CreatedDate")
          .eq("SenderUserId", Number(currentUserId))
          .eq("IsActive", true)
          .order("CreatedDate", { ascending: false })
          .limit(1000),
      ]);

      if (!isCurrent) {
        return;
      }

      const { data, error } = connectionsResult;

      if (error) {
        console.error("Paylaşım alıcıları alınamadı:", error);
        setRecipients([]);
        setRecipientsError("Takip ettiğin kullanıcılar şu an yüklenemedi.");
        setRecipientsLoading(false);
        return;
      }

      const nextShareStats = {};

      if (shareHistoryResult.error) {
        console.warn(
          "Paylaşım geçmişi sıralama için alınamadı:",
          shareHistoryResult.error
        );
      } else {
        for (const row of shareHistoryResult.data ?? []) {
          const recipientUserId = Number(row?.RecipientUserId);

          if (!Number.isInteger(recipientUserId) || recipientUserId <= 0) {
            continue;
          }

          const current = nextShareStats[recipientUserId] ?? {
            count: 0,
            lastSharedAt: 0,
          };

          nextShareStats[recipientUserId] = {
            count: current.count + 1,
            lastSharedAt: Math.max(
              current.lastSharedAt,
              Date.parse(row?.CreatedDate ?? "") || 0
            ),
          };
        }
      }

      setRecipientShareStats(nextShareStats);

      try {
        const unavailableUserIds = await getMyUnavailableUserIds();

        if (!isCurrent) {
          return;
        }

        setRecipients(
          filterUnavailableUsers(data ?? [], unavailableUserIds, ["UserId"])
        );
      } catch (relationshipError) {
        console.error(
          "Paylaşım alıcılarına ilişki filtresi uygulanamadı:",
          relationshipError
        );
        setRecipients(data ?? []);
      }

      setRecipientsLoading(false);
    };

    void loadRecipients();

    return () => {
      isCurrent = false;
    };
  }, [currentUserId, mode]);

  const rankedRecipients = useMemo(() => {
    return recipients
      .map((user, originalIndex) => ({ user, originalIndex }))
      .sort((first, second) => {
        const firstStats = recipientShareStats[Number(first.user?.UserId)] ?? {
          count: 0,
          lastSharedAt: 0,
        };
        const secondStats = recipientShareStats[Number(second.user?.UserId)] ?? {
          count: 0,
          lastSharedAt: 0,
        };

        if (secondStats.count !== firstStats.count) {
          return secondStats.count - firstStats.count;
        }

        if (secondStats.lastSharedAt !== firstStats.lastSharedAt) {
          return secondStats.lastSharedAt - firstStats.lastSharedAt;
        }

        return first.originalIndex - second.originalIndex;
      })
      .map(({ user }) => user);
  }, [recipientShareStats, recipients]);

  const visibleRecipients = useMemo(() => {
    const normalizedQuery = normalizeQuery(query);

    if (!normalizedQuery) {
      return rankedRecipients;
    }

    return rankedRecipients.filter((user) => {
      const searchText = [
        user?.Username,
        user?.FirstName,
        user?.LastName,
        user?.CityName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("tr-TR");

      return searchText.includes(normalizedQuery);
    });
  }, [query, rankedRecipients]);

  const handleBackdropMouseDown = (event) => {
    if (event.target === event.currentTarget && !sendingUserId) {
      onClose();
    }
  };

  const handleSend = async (recipient) => {
    const recipientUserId = Number(recipient?.UserId);

    if (
      !Number.isInteger(recipientUserId) ||
      recipientUserId <= 0 ||
      sendingUserId ||
      sentUserIds.has(recipientUserId)
    ) {
      return;
    }

    setSendingUserId(recipientUserId);
    setSendError("");

    const { data, error } = await supabase.rpc("SendContentShare", {
      p_recipient_user_id: recipientUserId,
      p_share_type_code: share.typeCode,
      p_place_id: share.placeId ?? null,
      p_place_note_id: share.placeNoteId ?? null,
      p_user_place_list_id: share.userPlaceListId ?? null,
      p_profile_user_id: share.profileUserId ?? null,
      p_message: message.trim() || null,
    });

    if (error) {
      console.error("Uygulama içi paylaşım gönderilemedi:", error);
      setSendError(
        error?.message || "Paylaşım şu an gönderilemedi. Tekrar dene."
      );
      setSendingUserId(null);
      return;
    }

    const contentShareId = Number(Array.isArray(data) ? data[0] : data);

    setSentUserIds((current) => {
      const next = new Set(current);
      next.add(recipientUserId);
      return next;
    });
    setRecipientShareStats((current) => {
      const previous = current[recipientUserId] ?? {
        count: 0,
        lastSharedAt: 0,
      };

      return {
        ...current,
        [recipientUserId]: {
          count: previous.count + 1,
          lastSharedAt: Date.now(),
        },
      };
    });
    setSendingUserId(null);
    onSent?.(recipient);

    if (Number.isInteger(contentShareId) && contentShareId > 0) {
      void supabase.functions
        .invoke("send-content-share-push", {
          body: { contentShareId },
        })
        .then(({ error: pushError }) => {
          if (pushError) {
            console.warn("Paylaşım push bildirimi gönderilemedi:", pushError);
          }
        })
        .catch((pushError) => {
          console.warn("Paylaşım push bildirimi gönderilemedi:", pushError);
        });
    }
  };

  return (
    <div
      className="content-share-backdrop"
      role="presentation"
      onMouseDown={handleBackdropMouseDown}
    >
      <section
        className="content-share-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="content-share-title"
      >
        <header className="content-share-header">
          <div>
            <p className="eyebrow">PAYLAŞ</p>
            <h2 id="content-share-title">
              {mode === "actions" ? "Nasıl paylaşmak istersin?" : "Bizim Mekanlar'da gönder"}
            </h2>
          </div>

          <button
            className="content-share-close"
            type="button"
            onClick={onClose}
            disabled={Boolean(sendingUserId)}
            aria-label="Kapat"
          >
            <AppIcon name="x" />
          </button>
        </header>

        <div className="content-share-target-card">
          <span className="content-share-target-icon" aria-hidden="true">
            <AppIcon name={shareTypeCopy.icon} />
          </span>
          <span className="content-share-target-copy">
            <small>{shareTypeCopy.label}</small>
            <strong>{share?.title || "İçerik"}</strong>
            {share?.subtitle && <span>{share.subtitle}</span>}
          </span>
        </div>

        {mode === "actions" ? (
          <div className="content-share-actions">
            <button
              className="content-share-primary-action"
              type="button"
              onClick={() => setMode("recipients")}
            >
              <span aria-hidden="true"><AppIcon name="user-circle-plus-fill" /></span>
              <span>
                <strong>Bizim Mekanlar'da gönder</strong>
                <small>Takip ettiğin bir kullanıcıya uygulama içinde ilet.</small>
              </span>
              <AppIcon name="arrow-right" />
            </button>

            <button
              className="content-share-secondary-action"
              type="button"
              onClick={() => void onExternalShare?.()}
            >
              <AppIcon name="share-network" />
              <span>Diğer uygulamalarda paylaş</span>
            </button>

            <button
              className="content-share-secondary-action"
              type="button"
              onClick={() => void onCopyLink?.()}
            >
              <AppIcon name="bookmark-simple" />
              <span>Bağlantıyı kopyala</span>
            </button>
          </div>
        ) : (
          <div className="content-share-recipient-view">
            <button
              className="content-share-back"
              type="button"
              onClick={() => {
                setMode("actions");
                setSendError("");
              }}
              disabled={Boolean(sendingUserId)}
            >
              <AppIcon name="arrow-left" />
              Paylaşım seçenekleri
            </button>

            <label className="content-share-message-field">
              <span>Kısa not <small>isteğe bağlı</small></span>
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                maxLength={100}
                rows={2}
                placeholder="Buraya birlikte gidelim mi?"
                disabled={Boolean(sendingUserId)}
              />
              <small>{message.length}/100</small>
            </label>

            <div className="content-share-search">
              <AppIcon name="magnifying-glass" />
              <input
                ref={searchInputRef}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Takip ettiklerinde ara"
                aria-label="Takip ettiklerinde ara"
                autoComplete="off"
              />
            </div>

            <div className="content-share-recipient-list">
              {recipientsLoading && (
                <p className="content-share-state">Kullanıcılar yükleniyor...</p>
              )}

              {!recipientsLoading && recipientsError && (
                <p className="content-share-state content-share-state-error" role="alert">
                  {recipientsError}
                </p>
              )}

              {!recipientsLoading && !recipientsError && recipients.length === 0 && (
                <div className="content-share-empty">
                  <span aria-hidden="true"><AppIcon name="user-circle-plus" /></span>
                  <strong>Henüz gönderebileceğin biri yok</strong>
                  <p>Önce birkaç kullanıcıyı takip ettiğinde burada görünecekler.</p>
                </div>
              )}

              {!recipientsLoading &&
                !recipientsError &&
                recipients.length > 0 &&
                visibleRecipients.length === 0 && (
                  <p className="content-share-state">Eşleşen kullanıcı bulunamadı.</p>
                )}

              {!recipientsLoading &&
                !recipientsError &&
                visibleRecipients.map((user) => {
                  const fullName = getFullName(user);
                  const avatarLetter = (user?.Username || fullName || "K")
                    .charAt(0)
                    .toUpperCase();
                  const photoUrl = profilePhotoUrls[Number(user?.UserId)] || "";
                  const userId = Number(user?.UserId);
                  const isSending = sendingUserId === userId;
                  const isSent = sentUserIds.has(userId);

                  return (
                    <article className="content-share-recipient" key={userId}>
                      <span className="content-share-recipient-avatar" aria-hidden="true">
                        {photoUrl ? <img src={photoUrl} alt="" /> : avatarLetter}
                      </span>

                      <span className="content-share-recipient-copy">
                        <strong>@{user?.Username}</strong>
                        <span>{fullName || user?.Username}</span>
                      </span>

                      <button
                        type="button"
                        className={isSent ? "content-share-send content-share-send-sent" : "content-share-send"}
                        onClick={() => void handleSend(user)}
                        disabled={Boolean(sendingUserId) || isSent}
                      >
                        {isSent ? (
                          <><AppIcon name="check" /> Gönderildi</>
                        ) : isSending ? (
                          "Gönderiliyor..."
                        ) : (
                          "Gönder"
                        )}
                      </button>
                    </article>
                  );
                })}
            </div>

            {sendError && (
              <p className="content-share-send-error" role="alert">
                {sendError}
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
