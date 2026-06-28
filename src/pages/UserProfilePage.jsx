import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabase.js";
import { getErrorMessageKey, MESSAGE_KEY, t } from "../i18n/messages.js";
import "../css/user-discovery.css";

function getFullName(profile) {
  return [profile?.FirstName, profile?.LastName].filter(Boolean).join(" ");
}

function ProfileStat({ label, value, isClickable, onClick }) {
  const content = (
    <>
      <strong>{Number(value ?? 0)}</strong>
      <span>{label}</span>
    </>
  );

  if (!isClickable) {
    return (
      <div
        className="foreign-profile-stat foreign-profile-stat-locked"
        aria-disabled="true"
      >
        {content}
      </div>
    );
  }

  return (
    <button className="foreign-profile-stat" type="button" onClick={onClick}>
      {content}
    </button>
  );
}

export default function UserProfilePage({
  userId,
  isActive,
  onBack,
  onOpenCollection,
  onFollowChanged,
}) {
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [isActionLoading, setIsActionLoading] = useState(false);

  const loadProfile = useCallback(
    async ({ silent = false } = {}) => {
      if (!userId) {
        return;
      }

      if (!silent) {
        setIsLoading(true);
        setErrorMessage("");
      }

      const { data, error } = await supabase.rpc("GetExternalUserProfile", {
        p_profile_user_id: userId,
      });

      if (error) {
        console.error("Kullanıcı profili alınamadı:", error);

        // Arka plan senkronizasyonu, ekrandaki çalışan profili kaldırmaz
        // veya kullanıcıya yeni hata yüzeyi açmaz.
        if (!silent) {
          setProfile(null);
          setErrorMessage(
            getErrorMessageKey(error, MESSAGE_KEY.EXTERNAL_PROFILE_LOAD_FAILED)
          );
        }

        if (!silent) {
          setIsLoading(false);
        }
        return;
      }

      const profileData = Array.isArray(data) ? data[0] : data;

      if (!profileData) {
        if (!silent) {
          setProfile(null);
          setErrorMessage(MESSAGE_KEY.USER_NOT_FOUND_OR_INACTIVE);
          setIsLoading(false);
        }
        return;
      }

      setProfile(profileData);
      setErrorMessage("");

      if (!silent) {
        setIsLoading(false);
      }
    },
    [userId]
  );

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (!isActive || !userId) {
      return undefined;
    }

    const channel = supabase
      .channel(`external-profile-follow-state:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "UserFollows",
        },
        () => {
          void loadProfile({ silent: true });
        }
      )
      .subscribe((status, error) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error("Profil takip durumu Realtime bağlantısı kurulamadı:", error);
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [isActive, loadProfile, userId]);

  useEffect(() => {
    if (!isActive || isActionLoading) {
      return undefined;
    }

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        onBack();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isActive, isActionLoading, onBack]);

  const handleFollowAction = async () => {
    if (!profile || isActionLoading) {
      return;
    }

    setIsActionLoading(true);
    setErrorMessage("");

    const shouldRemoveFollowRelation = ["ACCEPTED", "PENDING"].includes(
      profile.FollowStatusCode
    );
    const { error } = shouldRemoveFollowRelation
      ? await supabase.rpc("UnfollowUser", {
          p_following_user_id: profile.UserId,
        })
      : await supabase.rpc("RequestFollow", {
          p_following_user_id: profile.UserId,
        });

    if (error) {
      console.error("Takip işlemi başarısız:", error);
      setErrorMessage(
        getErrorMessageKey(error, MESSAGE_KEY.FOLLOW_ACTION_FAILED)
      );
      setIsActionLoading(false);
      return;
    }

    // Kullanıcı aksiyonu anında görür; ekranı loading durumuna düşürme.
    const nextFollowStatus = shouldRemoveFollowRelation
      ? "NONE"
      : profile.AccountVisibilityCode === "PRIVATE"
        ? "PENDING"
        : "ACCEPTED";

    setProfile((currentProfile) =>
      currentProfile
        ? {
            ...currentProfile,
            FollowStatusCode: nextFollowStatus,
          }
        : currentProfile
    );
    setIsActionLoading(false);

    // RPC sonucu doğru state'i zaten değiştirdi. Ardından arka planda
    // profile/badge/sayıları yeniden doğrula; kullanıcı bu işlemi fark etmez.
    void Promise.all([
      loadProfile({ silent: true }),
      Promise.resolve(onFollowChanged?.()),
    ]).catch((refreshError) => {
      console.error("Takip işlemi sonrası sessiz yenileme başarısız:", refreshError);
    });
  };

  const visibilityIsPrivate = profile?.AccountVisibilityCode === "PRIVATE";
  const canViewCollections = Boolean(profile?.CanViewCollections);
  const followStatus = profile?.FollowStatusCode || "NONE";
  const fullName = getFullName(profile);
  const avatarLetter = (profile?.Username || fullName || "K")
    .charAt(0)
    .toUpperCase();

  const followButtonLabel =
    followStatus === "ACCEPTED"
      ? "Takip ediliyor"
      : followStatus === "PENDING"
        ? "İsteği geri çek"
        : visibilityIsPrivate
          ? followStatus === "REJECTED"
            ? "Tekrar istek gönder"
            : "Takip isteği gönder"
          : "Takip et";

  return (
    <div className="discovery-page-content foreign-profile-page">
      <header className="discovery-page-header">
        <div>
          <p className="eyebrow">KULLANICI PROFİLİ</p>
          <h1>{profile?.Username || "Profil"}</h1>
        </div>

        <button
          className="discovery-back-button"
          type="button"
          onClick={onBack}
          disabled={isActionLoading}
          aria-label="Geri dön"
        >
          ‹
          <span>Geri</span>
        </button>
      </header>

      <div className="discovery-page-body">
        {isLoading && (
          <div className="foreign-profile-state">Profil yükleniyor...</div>
        )}

        {!isLoading && errorMessage && !profile && (
          <div className="foreign-profile-state foreign-profile-state-error">
            <p>{t(errorMessage)}</p>
            <button type="button" onClick={loadProfile}>
              Tekrar dene
            </button>
          </div>
        )}

        {!isLoading && profile && (
          <div className="foreign-profile-content">
            <div className="foreign-profile-top">
              <div className="foreign-profile-avatar" aria-hidden="true">
                {avatarLetter}
              </div>

              <div className="foreign-profile-identity">
                <p>{profile.Username}</p>
                <h2>{fullName || profile.Username}</h2>
                <div className="foreign-profile-public-details">
                  {profile.CityName && <span>⌖ {profile.CityName}</span>}
                  {profile.ZodiacSign && <span>✦ {profile.ZodiacSign}</span>}
                </div>
              </div>
            </div>

            <div
              className="foreign-profile-stats"
              aria-label="Profil istatistikleri"
            >
              <ProfileStat
                label="Not"
                value={profile.NoteCount}
                isClickable={canViewCollections}
                onClick={() =>
                  onOpenCollection({
                    userId: profile.UserId,
                    username: profile.Username,
                    type: "notes",
                  })
                }
              />
              <ProfileStat
                label="Takipçi"
                value={profile.FollowerCount}
                isClickable={canViewCollections}
                onClick={() =>
                  onOpenCollection({
                    userId: profile.UserId,
                    username: profile.Username,
                    type: "followers",
                  })
                }
              />
              <ProfileStat
                label="Takip"
                value={profile.FollowingCount}
                isClickable={canViewCollections}
                onClick={() =>
                  onOpenCollection({
                    userId: profile.UserId,
                    username: profile.Username,
                    type: "following",
                  })
                }
              />
            </div>

            {visibilityIsPrivate && !canViewCollections && (
              <p className="foreign-profile-private-message">
                Bu hesap gizli. Notlar ve takip listeleri, takip isteğin kabul
                edildiğinde görünür.
              </p>
            )}

            {errorMessage && profile && (
              <p className="foreign-profile-action-error" role="alert">
                {t(errorMessage)}
              </p>
            )}

            <button
              className={`foreign-profile-follow-button ${
                followStatus === "ACCEPTED" ? "foreign-profile-following" : ""
              } ${followStatus === "PENDING" ? "foreign-profile-pending" : ""}`}
              type="button"
              disabled={isActionLoading}
              onClick={handleFollowAction}
            >
              {isActionLoading ? "İşleniyor..." : followButtonLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
