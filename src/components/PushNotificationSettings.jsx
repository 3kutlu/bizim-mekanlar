import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_PUSH_NOTIFICATION_PREFERENCES,
  disablePushNotifications,
  enablePushNotifications,
  getMyPushNotificationPreferences,
  getPushNotificationStatus,
  updateMyPushNotificationPreferences,
} from "../utils/pushNotifications.js";

const PREFERENCE_OPTIONS = [
  {
    key: "followRequestEnabled",
    title: "Takip istekleri",
    description: "Biri sana takip isteği gönderdiğinde.",
  },
  {
    key: "followedEnabled",
    title: "Yeni takipçiler",
    description: "Biri seni takip etmeye başladığında.",
  },
  {
    key: "followingNoteEnabled",
    title: "Takip ettiklerinin notları",
    description: "Takip ettiğin biri yeni not eklediğinde.",
  },
  {
    key: "noteReactionEnabled",
    title: "Notuna gelen tepkiler",
    description: "Birisi notunu beğendiğinde veya beğenmediğinde.",
  },
  {
    key: "collectionCollaboratorEnabled",
    title: "Ortak koleksiyonlar",
    description: "Birisi seni ortak koleksiyona eklediğinde.",
  },
  {
    key: "collectionPlaceAddedEnabled",
    title: "Koleksiyona eklenen mekanlar",
    description: "Ortak koleksiyonuna yeni bir mekan eklendiğinde.",
  },
  {
    key: "contentShareEnabled",
    title: "Uygulama içi paylaşımlar",
    description: "Birisi sana mekan, not, koleksiyon veya profil gönderdiğinde.",
  },
];

function getCopyForState(state) {
  switch (state) {
    case "enabled":
      return {
        title: "Bu cihazda açık",
        description: "Bu cihaz sistem bildirimlerini alıyor.",
        action: "Kapat",
      };
    case "needs-home-screen":
      return {
        title: "Ana ekrandan aç",
        description:
          "iPhone ve iPad'de bildirimleri açmak için Bizim Mekanlar'ı ana ekrandaki uygulama simgesinden açmalısın.",
        action: "",
      };
    case "blocked":
      return {
        title: "Tarayıcıda engellenmiş",
        description:
          "Bildirim izni kapalı. Tarayıcı veya uygulama ayarlarından izin verip tekrar dene.",
        action: "",
      };
    case "not-configured":
      return {
        title: "Henüz yapılandırılmadı",
        description: "Bildirim altyapısı henüz bu ortam için hazır değil.",
        action: "",
      };
    case "unsupported":
      return {
        title: "Bu cihaz desteklemiyor",
        description: "Bu tarayıcı push bildirimlerini desteklemiyor.",
        action: "",
      };
    case "unavailable":
      return {
        title: "Şu an kullanılamıyor",
        description: "Bildirim ayarları şu an okunamadı. Biraz sonra tekrar dene.",
        action: "Tekrar dene",
      };
    default:
      return {
        title: "Bildirimleri aç",
        description: "Telefonunda sistem bildirimi almak için bu cihazı bağla.",
        action: "Aç",
      };
  }
}

export default function PushNotificationSettings({ disabled = false }) {
  const [status, setStatus] = useState({ state: "loading" });
  const [preferences, setPreferences] = useState(
    DEFAULT_PUSH_NOTIFICATION_PREFERENCES
  );
  const [preferencesLoading, setPreferencesLoading] = useState(true);
  const [isDeviceSaving, setIsDeviceSaving] = useState(false);
  const [isPreferencesSaving, setIsPreferencesSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const refreshStatus = useCallback(async () => {
    try {
      setStatus(await getPushNotificationStatus());
    } catch (error) {
      console.error("Push bildirim ayarı okunamadı:", error);
      setStatus({ state: "unavailable" });
    }
  }, []);

  const refreshPreferences = useCallback(async () => {
    setPreferencesLoading(true);

    try {
      setPreferences(await getMyPushNotificationPreferences());
    } catch (error) {
      console.error("Push bildirim tercihleri okunamadı:", error);
      setErrorMessage("Bildirim tercihleri okunamadı. Tekrar dene.");
    } finally {
      setPreferencesLoading(false);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setErrorMessage("");
    setStatus({ state: "loading" });

    await Promise.all([refreshStatus(), refreshPreferences()]);
  }, [refreshPreferences, refreshStatus]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  const handleDeviceAction = async () => {
    if (disabled || isDeviceSaving) {
      return;
    }

    setIsDeviceSaving(true);
    setErrorMessage("");

    try {
      if (status.state === "unavailable") {
        await refreshStatus();
        return;
      }

      const result =
        status.state === "enabled"
          ? await disablePushNotifications()
          : await enablePushNotifications();

      setStatus(result);
    } catch (error) {
      console.error("Push cihaz ayarı güncellenemedi:", error);
      setErrorMessage(
        error?.message || "Bu cihazın bildirim ayarı güncellenemedi. Tekrar dene."
      );
      await refreshStatus();
    } finally {
      setIsDeviceSaving(false);
    }
  };

  const handlePreferenceChange = async (key, nextValue) => {
    if (disabled || preferencesLoading || isPreferencesSaving) {
      return;
    }

    const previousPreferences = preferences;
    const nextPreferences = {
      ...preferences,
      [key]: nextValue,
    };

    setPreferences(nextPreferences);
    setIsPreferencesSaving(true);
    setErrorMessage("");

    try {
      const savedPreferences = await updateMyPushNotificationPreferences(
        nextPreferences
      );
      setPreferences(savedPreferences);
    } catch (error) {
      console.error("Push bildirim tercihi güncellenemedi:", error);
      setPreferences(previousPreferences);
      setErrorMessage(
        error?.message || "Bildirim tercihi güncellenemedi. Tekrar dene."
      );
    } finally {
      setIsPreferencesSaving(false);
    }
  };

  const copy = getCopyForState(status.state);
  const canAct = ["ready", "enabled", "unavailable"].includes(status.state);
  const isDeviceLoading = status.state === "loading";

  return (
    <section className="notification-settings-panel" aria-labelledby="push-settings-title">
      <div className="notification-settings-section">
        <div className="notification-settings-heading">
          <div>
            <strong id="push-settings-title">Telefon bildirimleri</strong>
            <span>
              {isDeviceLoading ? "Kontrol ediliyor..." : copy.description}
            </span>
          </div>

          {canAct && !isDeviceLoading && (
            <button
              className="notification-settings-device-action"
              type="button"
              disabled={disabled || isDeviceSaving}
              onClick={() => void handleDeviceAction()}
            >
              {isDeviceSaving ? "İşleniyor..." : copy.action}
            </button>
          )}
        </div>

        {!isDeviceLoading && status.state !== "enabled" && (
          <small className="notification-settings-device-status">{copy.title}</small>
        )}
      </div>

      <div className="notification-settings-divider" />

      <div className="notification-settings-section">
        <div className="notification-settings-preference-intro">
          <strong>Bildirim tercihleri</strong>
          <span>
            Kapattığın türler telefona gelmez. Gelişmeler ekranında görünmeye devam eder.
          </span>
        </div>

        <div className="notification-preference-list">
          {PREFERENCE_OPTIONS.map((option) => {
            const isEnabled = Boolean(preferences[option.key]);

            return (
              <label className="notification-preference-row" key={option.key}>
                <span className="notification-preference-copy">
                  <strong>{option.title}</strong>
                  <small>{option.description}</small>
                </span>

                <input
                  className="notification-preference-input"
                  type="checkbox"
                  checked={isEnabled}
                  disabled={
                    disabled || preferencesLoading || isPreferencesSaving
                  }
                  onChange={(event) =>
                    void handlePreferenceChange(option.key, event.target.checked)
                  }
                />
                <span className="notification-preference-switch" aria-hidden="true">
                  <span />
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {preferencesLoading && (
        <p className="notification-settings-state">Tercihler yükleniyor...</p>
      )}

      {isPreferencesSaving && (
        <p className="notification-settings-state">Kaydediliyor...</p>
      )}

      {errorMessage && (
        <p className="notification-settings-error" role="alert">
          {errorMessage}
        </p>
      )}
    </section>
  );
}
