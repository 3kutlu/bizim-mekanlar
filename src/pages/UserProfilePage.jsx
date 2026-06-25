import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabase.js";
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

  const loadProfile = useCallback(async () => {
    if (!userId) {
      return;
    }

    setIsLoading(true);
    setErrorMessage("");

    const { data, error } = await supabase.rpc("GetExternalUserProfile", {
      p_profile_user_id: userId,
    });

    if (error) {
      console.error("Kullanıcı profili alınamadı:", error);
      setProfile(null);
      setErrorMessage(error.message || "Profil şu an yüklenemedi.");
    } else {
      const profileData = Array.isArray(data) ? data[0] : data;

      if (!profileData) {
        setProfile(null);
        setErrorMessage("Kullanıcı bulunamadı veya artık aktif değil.");
      } else {
        setProfile(profileData);
      }
    }

    setIsLoading(false);
  }, [userId]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

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

    const isFollowing = profile.FollowStatusCode === "ACCEPTED";
    const { error } = isFollowing
      ? await supabase.rpc("UnfollowUser", {
          p_following_user_id: profile.UserId,
        })
      : await supabase.rpc("RequestFollow", {
          p_following_user_id: profile.UserId,
        });

    if (error) {
      console.error("Takip işlemi başarısız:", error);
      setErrorMessage(error.message || "Takip işlemi gerçekleştirilemedi.");
      setIsActionLoading(false);
      return;
    }

    await Promise.all([loadProfile(), onFollowChanged?.()]);
    setIsActionLoading(false);
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
        ? "İstek gönderildi"
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
            <p>{errorMessage}</p>
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
                {errorMessage}
              </p>
            )}

            <button
              className={`foreign-profile-follow-button ${
                followStatus === "ACCEPTED" ? "foreign-profile-following" : ""
              }`}
              type="button"
              disabled={isActionLoading || followStatus === "PENDING"}
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
