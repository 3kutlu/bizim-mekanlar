import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import AppIcon from "../../components/AppIcon.jsx";
import PushNotificationSettings from "../../components/PushNotificationSettings.jsx";
import { supabase } from "../../supabase.js";
import { useProfilePhotoUrls } from "../../utils/profilePhotos.js";
import "../../css/settings-page.css";

const ProfileEditModal = lazy(() =>
  import("../profile/MyProfilePage.jsx").then((module) => ({ default: module.ProfileEditModal }))
);

const SETTINGS_VIEWS = Object.freeze({
  MAIN: "main",
  PRIVACY: "privacy",
  BLOCKED: "blocked",
  MUTED: "muted",
  NOTIFICATIONS: "notifications",
});

async function getFunctionErrorMessage(error) {
  try {
    const response = error?.context;

    if (response && typeof response.clone === "function") {
      const body = await response.clone().json();
      return String(body?.message ?? "").trim();
    }
  } catch {
    // Edge Function response body may not be JSON.
  }

  return "";
}

async function invokeAccountAction(action, extraBody = {}) {
  const { data, error } = await supabase.functions.invoke("manage-account", {
    body: { action, ...extraBody },
  });

  if (error) {
    const responseMessage = await getFunctionErrorMessage(error);
    throw new Error(
      responseMessage ||
        error?.message ||
        "Hesap işlemi şu an tamamlanamadı. Tekrar dene."
    );
  }

  return data ?? {};
}

function SettingsHeader({ title, eyebrow = "AYARLAR", onBack }) {
  return (
    <header className="settings-page-header">
      <button
        className="settings-back-button"
        type="button"
        onClick={onBack}
        aria-label="Geri dön"
        title="Geri dön"
      >
        <AppIcon name="arrow-left" />
      </button>
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
      </div>
    </header>
  );
}

function SettingsRow({ icon, title, description, danger = false, onClick }) {
  return (
    <button
      className={`settings-row${danger ? " settings-row-danger" : ""}`}
      type="button"
      onClick={onClick}
    >
      <span className="settings-row-icon" aria-hidden="true">
        <AppIcon name={icon} />
      </span>
      <span className="settings-row-copy">
        <strong>{title}</strong>
        {description && <small>{description}</small>}
      </span>
      <AppIcon name="caret-right-fill" className="settings-row-caret" />
    </button>
  );
}

function ConfirmationDialog({
  title,
  eyebrow = "HESAP İŞLEMİ",
  children,
  confirmLabel,
  confirmDisabled = false,
  busy = false,
  errorMessage = "",
  danger = false,
  onCancel,
  onConfirm,
}) {
  return createPortal(
    <div
      className="settings-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (!busy && event.target === event.currentTarget) {
          onCancel();
        }
      }}
    >
      <section
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
      >
        <p className="eyebrow">{eyebrow}</p>
        <h2 id="settings-dialog-title">{title}</h2>
        <div className="settings-dialog-copy">{children}</div>

        {errorMessage && (
          <p className="settings-dialog-error" role="alert">
            {errorMessage}
          </p>
        )}

        <div className="settings-dialog-actions">
          <button type="button" disabled={busy} onClick={onCancel}>
            Vazgeç
          </button>
          <button
            className={danger ? "settings-dialog-danger" : "settings-dialog-primary"}
            type="button"
            disabled={busy || confirmDisabled}
            onClick={onConfirm}
          >
            {busy ? "İşleniyor..." : confirmLabel}
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}

function UserManagementList({
  kind,
  rows,
  loading,
  errorMessage,
  actionUserId,
  onRetry,
  onAction,
}) {
  const profilePhotoUrls = useProfilePhotoUrls(
    useMemo(() => rows.map((row) => row?.UserId), [rows])
  );
  const isBlocked = kind === "blocked";

  if (loading) {
    return <p className="settings-state">Yükleniyor...</p>;
  }

  if (errorMessage) {
    return (
      <div className="settings-state settings-state-error">
        <p>{errorMessage}</p>
        <button type="button" onClick={onRetry}>Tekrar dene</button>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="settings-empty-state">
        <AppIcon name={isBlocked ? "x-circle" : "bell"} />
        <h2>{isBlocked ? "Engellenen hesap yok" : "Sessize alınan hesap yok"}</h2>
        <p>
          {isBlocked
            ? "Engellediğin hesaplar burada görünür."
            : "Not ve tepki bildirimlerini kapattığın hesaplar burada görünür."}
        </p>
      </div>
    );
  }

  return (
    <div className="settings-user-list">
      {rows.map((row) => {
        const userId = Number(row?.UserId);
        const fullName = [row?.FirstName, row?.LastName].filter(Boolean).join(" ");
        const avatarLetter = String(row?.Username || fullName || "K")
          .charAt(0)
          .toUpperCase();
        const profilePhotoUrl = profilePhotoUrls[userId] || "";
        const isBusy = actionUserId === userId;

        return (
          <article className="settings-user-row" key={userId}>
            <span className="settings-user-avatar" aria-hidden="true">
              {profilePhotoUrl ? <img src={profilePhotoUrl} alt="" /> : avatarLetter}
            </span>
            <span className="settings-user-copy">
              <strong>@{row?.Username}</strong>
              <small>{fullName || row?.Username}</small>
            </span>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => onAction(row)}
            >
              {isBusy
                ? "İşleniyor..."
                : isBlocked
                  ? "Engeli kaldır"
                  : "Sesi aç"}
            </button>
          </article>
        );
      })}
    </div>
  );
}

export function AccountRecoveryPage({ profile, onRecovered, onLogout }) {
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const isDeletionPending = profile?.AccountStatus === "DELETION_PENDING";
  const scheduledDeletionTime = profile?.ScheduledDeletionDate
    ? new Date(profile.ScheduledDeletionDate).getTime()
    : Number.NaN;
  const isRecoveryExpired =
    isDeletionPending &&
    Number.isFinite(scheduledDeletionTime) &&
    scheduledDeletionTime <= Date.now();
  const scheduledDate = Number.isFinite(scheduledDeletionTime)
    ? new Intl.DateTimeFormat("tr-TR", {
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(scheduledDeletionTime))
    : "";

  const reactivate = async () => {
    if (busy) return;
    setBusy(true);
    setErrorMessage("");

    try {
      await invokeAccountAction("reactivate");
      await onRecovered?.();
    } catch (error) {
      console.error("Hesap yeniden açılamadı:", error);
      setErrorMessage(error?.message || "Hesap yeniden açılamadı.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="account-recovery-page">
      <section className="account-recovery-card">
        <span className="account-recovery-icon" aria-hidden="true">
          <AppIcon name={isDeletionPending ? "warning" : "eye-slash"} />
        </span>
        <p className="eyebrow">BİZİM MEKANLAR</p>
        <h1>
          {isDeletionPending
            ? "Hesabın silinmek üzere"
            : "Hesabın dondurulmuş"}
        </h1>
        <p>
          {isRecoveryExpired
            ? "Hesabının geri açılma süresi doldu. Kalıcı silme işlemi tamamlanıyor."
            : isDeletionPending
              ? `Hesabın${scheduledDate ? ` ${scheduledDate} tarihinde` : ""} kalıcı olarak silinecek. Bu süre dolmadan hesabını yeniden açabilirsin.`
              : "Profilin ve içeriklerin şu anda görünmüyor. Hesabını yeniden açtığında her şey kaldığı yerden devam eder."}
        </p>

        {errorMessage && (
          <p className="account-recovery-error" role="alert">{errorMessage}</p>
        )}

        {!isRecoveryExpired && (
          <button
            className="account-recovery-primary"
            type="button"
            disabled={busy}
            onClick={() => void reactivate()}
          >
            {busy ? "Açılıyor..." : "Hesabımı tekrar aç"}
          </button>
        )}
        <button
          className="account-recovery-secondary"
          type="button"
          disabled={busy}
          onClick={onLogout}
        >
          Şimdilik çıkış yap
        </button>
      </section>
    </main>
  );
}

export default function SettingsPage({
  profile,
  cities,
  citiesLoading,
  citiesError,
  isActive,
  onBack,
  onProfileSaved,
  onLogout,
  onAccountStatusChanged,
}) {
  const [view, setView] = useState(SETTINGS_VIEWS.MAIN);
  const [isProfileEditOpen, setIsProfileEditOpen] = useState(false);
  const [managedUsers, setManagedUsers] = useState([]);
  const [managedUsersLoading, setManagedUsersLoading] = useState(false);
  const [managedUsersError, setManagedUsersError] = useState("");
  const [actionUserId, setActionUserId] = useState(null);
  const [privacySaving, setPrivacySaving] = useState(false);
  const [privacyError, setPrivacyError] = useState("");
  const [isPrivate, setIsPrivate] = useState(
    Number(profile?.AccountVisibilityStatusId) === 2
  );
  const [dialog, setDialog] = useState(null);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [dialogError, setDialogError] = useState("");
  const [deleteUsername, setDeleteUsername] = useState("");

  useEffect(() => {
    setIsPrivate(Number(profile?.AccountVisibilityStatusId) === 2);
  }, [profile?.AccountVisibilityStatusId]);

  useEffect(() => {
    if (!isActive) return undefined;

    const handleEscape = (event) => {
      if (event.key !== "Escape" || dialog || isProfileEditOpen) return;

      if (view === SETTINGS_VIEWS.MAIN) {
        onBack();
      } else {
        setView(SETTINGS_VIEWS.MAIN);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [dialog, isActive, isProfileEditOpen, onBack, view]);

  const goBack = () => {
    if (view === SETTINGS_VIEWS.MAIN) {
      onBack();
      return;
    }

    setView(SETTINGS_VIEWS.MAIN);
    setManagedUsersError("");
  };

  const loadManagedUsers = useCallback(async (nextView = view) => {
    const isBlockedView = nextView === SETTINGS_VIEWS.BLOCKED;
    setManagedUsersLoading(true);
    setManagedUsersError("");

    const { data, error } = await supabase.rpc(
      isBlockedView ? "GetMyBlockedUsers" : "GetMyMutedUsers"
    );

    if (error) {
      console.error("Hesap listesi alınamadı:", error);
      setManagedUsers([]);
      setManagedUsersError("Liste şu an yüklenemedi. Tekrar dene.");
    } else {
      setManagedUsers(data ?? []);
    }

    setManagedUsersLoading(false);
  }, [view]);

  const openUserManagement = (nextView) => {
    setView(nextView);
    void loadManagedUsers(nextView);
  };

  const handleUserManagementAction = async (row) => {
    const userId = Number(row?.UserId);
    if (!Number.isInteger(userId) || userId <= 0 || actionUserId) return;

    setActionUserId(userId);
    setManagedUsersError("");

    const rpcName = view === SETTINGS_VIEWS.BLOCKED ? "UnblockUser" : "UnmuteUser";
    const parameterName = view === SETTINGS_VIEWS.BLOCKED
      ? "p_blocked_user_id"
      : "p_muted_user_id";
    const { error } = await supabase.rpc(rpcName, {
      [parameterName]: userId,
    });

    if (error) {
      console.error("Kullanıcı ilişkisi güncellenemedi:", error);
      setManagedUsersError("İşlem tamamlanamadı. Tekrar dene.");
    } else {
      setManagedUsers((currentRows) =>
        currentRows.filter((currentRow) => Number(currentRow?.UserId) !== userId)
      );
    }

    setActionUserId(null);
  };

  const updatePrivacy = async (nextPrivate) => {
    if (privacySaving) return;

    const previousValue = isPrivate;
    setIsPrivate(nextPrivate);
    setPrivacySaving(true);
    setPrivacyError("");

    const { error } = await supabase.rpc("SetMyAccountVisibility", {
      p_is_private: nextPrivate,
    });

    if (error) {
      console.error("Hesap gizliliği güncellenemedi:", error);
      setIsPrivate(previousValue);
      setPrivacyError("Hesap gizliliği güncellenemedi. Tekrar dene.");
    } else {
      await onProfileSaved?.();
    }

    setPrivacySaving(false);
  };

  const closeDialog = () => {
    if (dialogBusy) return;
    setDialog(null);
    setDialogError("");
    setDeleteUsername("");
  };

  const freezeAccount = async () => {
    setDialogBusy(true);
    setDialogError("");

    try {
      await invokeAccountAction("freeze");
      await onAccountStatusChanged?.("FROZEN");
    } catch (error) {
      console.error("Hesap dondurulamadı:", error);
      setDialogError(error?.message || "Hesap dondurulamadı.");
      setDialogBusy(false);
    }
  };

  const requestDeletion = async () => {
    setDialogBusy(true);
    setDialogError("");

    try {
      await invokeAccountAction("request-deletion", {
        username: deleteUsername.trim().toLowerCase(),
      });
      await onAccountStatusChanged?.("DELETION_PENDING");
    } catch (error) {
      console.error("Hesap silme talebi oluşturulamadı:", error);
      setDialogError(error?.message || "Hesap silme talebi oluşturulamadı.");
      setDialogBusy(false);
    }
  };

  const normalizedUsername = String(profile?.Username ?? "").trim().toLowerCase();
  const deleteUsernameMatches =
    deleteUsername.trim().toLowerCase() === normalizedUsername;

  const renderMain = () => (
    <>
      <SettingsHeader title="Ayarlar" onBack={goBack} />
      <div className="settings-page-body">
        <section className="settings-section">
          <h2>Profil ve hesap</h2>
          <div className="settings-section-card">
            <SettingsRow
              icon="pencil-simple"
              title="Profilimi düzenle"
              description="Profil fotoğrafı ve kişisel bilgiler"
              onClick={() => setIsProfileEditOpen(true)}
            />
            <SettingsRow
              icon={isPrivate ? "eye-slash" : "eye"}
              title="Hesap gizliliği"
              description={isPrivate ? "Gizli hesap" : "Herkese açık hesap"}
              onClick={() => setView(SETTINGS_VIEWS.PRIVACY)}
            />
            <SettingsRow
              icon="x-circle"
              title="Engellenen hesaplar"
              description="Engellediğin kullanıcıları yönet"
              onClick={() => openUserManagement(SETTINGS_VIEWS.BLOCKED)}
            />
            <SettingsRow
              icon="bell"
              title="Sessize alınan hesaplar"
              description="Kullanıcı bazlı not ve tepki bildirimleri"
              onClick={() => openUserManagement(SETTINGS_VIEWS.MUTED)}
            />
          </div>
        </section>

        <section className="settings-section">
          <h2>Bildirimler</h2>
          <div className="settings-section-card">
            <SettingsRow
              icon="bell-ringing"
              title="Bildirim ayarları"
              description="Cihaz ve kategori tercihleri"
              onClick={() => setView(SETTINGS_VIEWS.NOTIFICATIONS)}
            />
          </div>
        </section>

        <section className="settings-section">
          <h2>Hesap işlemleri</h2>
          <div className="settings-section-card">
            <SettingsRow
              icon="sign-out"
              title="Çıkış yap"
              onClick={onLogout}
            />
            <SettingsRow
              icon="eye-slash"
              title="Hesabı dondur"
              description="Süresiz gizle, istediğinde geri aç"
              onClick={() => setDialog("freeze")}
            />
            <SettingsRow
              icon="trash"
              title="Hesabımı sil"
              description="7 gün sonra kalıcı olarak silinir"
              danger
              onClick={() => setDialog("delete")}
            />
          </div>
        </section>
      </div>
    </>
  );

  const renderPrivacy = () => (
    <>
      <SettingsHeader title="Hesap gizliliği" onBack={goBack} />
      <div className="settings-page-body">
        <section className="settings-detail-card">
          <div className="settings-detail-icon"><AppIcon name={isPrivate ? "eye-slash" : "eye"} /></div>
          <h2>{isPrivate ? "Gizli hesap" : "Herkese açık hesap"}</h2>
          <p>
            {isPrivate
              ? "Notların, fotoğrafların ve takip listelerin yalnızca kabul ettiğin takipçilere görünür."
              : "Profilin, notların ve takip listelerin diğer kullanıcılara görünür."}
          </p>
          <label className="settings-toggle-row">
            <span>
              <strong>Gizli hesap</strong>
              <small>Takip isteklerini sen onaylarsın.</small>
            </span>
            <input
              type="checkbox"
              checked={isPrivate}
              disabled={privacySaving}
              onChange={(event) => void updatePrivacy(event.target.checked)}
            />
            <span className="settings-toggle-switch" aria-hidden="true"><span /></span>
          </label>
          {privacySaving && <p className="settings-state">Kaydediliyor...</p>}
          {privacyError && <p className="settings-inline-error" role="alert">{privacyError}</p>}
        </section>
      </div>
    </>
  );

  const managedTitle = view === SETTINGS_VIEWS.BLOCKED
    ? "Engellenen hesaplar"
    : "Sessize alınan hesaplar";

  return (
    <div className="discovery-page-content settings-page">
      {view === SETTINGS_VIEWS.MAIN && renderMain()}
      {view === SETTINGS_VIEWS.PRIVACY && renderPrivacy()}
      {[SETTINGS_VIEWS.BLOCKED, SETTINGS_VIEWS.MUTED].includes(view) && (
        <>
          <SettingsHeader title={managedTitle} onBack={goBack} />
          <div className="settings-page-body">
            {view === SETTINGS_VIEWS.MUTED && (
              <p className="settings-explainer">
                Sessize aldığın kişinin yeni not, not beğenme ve not beğenmeme bildirimleri kapatılır. Ortak koleksiyon bildirimleri gelmeye devam eder.
              </p>
            )}
            <UserManagementList
              kind={view}
              rows={managedUsers}
              loading={managedUsersLoading}
              errorMessage={managedUsersError}
              actionUserId={actionUserId}
              onRetry={() => void loadManagedUsers(view)}
              onAction={(row) => void handleUserManagementAction(row)}
            />
          </div>
        </>
      )}
      {view === SETTINGS_VIEWS.NOTIFICATIONS && (
        <>
          <SettingsHeader title="Bildirim ayarları" onBack={goBack} />
          <div className="settings-page-body settings-notification-body">
            <PushNotificationSettings />
          </div>
        </>
      )}

      {isProfileEditOpen && (
        <Suspense fallback={null}>
          <ProfileEditModal
            profile={profile}
            cities={cities}
            citiesLoading={citiesLoading}
            citiesError={citiesError}
            onClose={() => setIsProfileEditOpen(false)}
            onSaved={async () => {
              await onProfileSaved?.();
              setIsProfileEditOpen(false);
            }}
          />
        </Suspense>
      )}

      {dialog === "freeze" && (
        <ConfirmationDialog
          title="Hesabını dondurmak istiyor musun?"
          confirmLabel="Hesabı dondur"
          busy={dialogBusy}
          errorMessage={dialogError}
          onCancel={closeDialog}
          onConfirm={() => void freezeAccount()}
        >
          <p>Profilin ve içeriklerin diğer kullanıcılara görünmez.</p>
          <p>Bu işlem süresizdir. Tekrar giriş yaptığında hesabını tek dokunuşla yeniden açabilirsin.</p>
        </ConfirmationDialog>
      )}

      {dialog === "delete" && (
        <ConfirmationDialog
          title="Hesabını silmek istediğine emin misin?"
          confirmLabel="Hesabımı sil"
          confirmDisabled={!deleteUsernameMatches}
          busy={dialogBusy}
          errorMessage={dialogError}
          danger
          onCancel={closeDialog}
          onConfirm={() => void requestDeletion()}
        >
          <p>Hesabın önce 7 gün süreyle dondurulur. Bu süre içinde giriş yapıp hesabını geri açabilirsin.</p>
          <p>7 günün sonunda hesabın, içeriklerin ve fotoğrafların kalıcı olarak silinir.</p>
          <label className="settings-delete-confirmation">
            Devam etmek için <strong>{normalizedUsername}</strong> yaz:
            <input
              type="text"
              value={deleteUsername}
              disabled={dialogBusy}
              autoComplete="off"
              onChange={(event) => setDeleteUsername(event.target.value)}
            />
          </label>
        </ConfirmationDialog>
      )}
    </div>
  );
}
