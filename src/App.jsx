import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase.js";
import AuthPage from "./AuthPage.jsx";
import MapPage from "./MapPage.jsx";
import "./css/app-shell.css";
import "./css/list-page.css";
import "./css/profile-page.css";

const EMPTY_SUMMARY = {
  CityName: "",
  FollowerCount: 0,
  FollowingCount: 0,
  NoteCount: 0,
};

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
  const [cities, setCities] = useState([]);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [citiesError, setCitiesError] = useState("");

  useEffect(() => {
    let isMounted = true;

    const loadSession = async () => {
      const { data, error } = await supabase.auth.getSession();

      if (!isMounted) {
        return;
      }

      if (error) {
        console.error("Oturum alınamadı:", error);
        setAppMessage(error.message);
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
        "UserId, Username, FirstName, LastName, BirthDate, ZodiacSign, Email, CityId, IsActive"
      )
      .eq("AuthUserId", session.user.id)
      .eq("IsActive", true)
      .maybeSingle();

    if (profileQueryError) {
      console.error("Profil alınamadı:", profileQueryError);
      setProfile(null);
      setSummary(EMPTY_SUMMARY);
      setProfileError("Profil bilgilerin yüklenemedi.");
      setProfileLoading(false);
      return;
    }

    if (!profileData) {
      setProfile(null);
      setSummary(EMPTY_SUMMARY);
      setProfileError(
        "Hesabın oluşturuldu fakat profil kaydın bulunamadı. Lütfen yeniden giriş yapmayı dene."
      );
      setProfileLoading(false);
      return;
    }

    setProfile(profileData);

    const { data: summaryRows, error: summaryError } = await supabase.rpc(
      "GetUserProfileSummary",
      { p_user_id: profileData.UserId }
    );

    if (summaryError) {
      console.error("Profil özeti alınamadı:", summaryError);
      setSummary(EMPTY_SUMMARY);
    } else {
      const summaryData = Array.isArray(summaryRows)
        ? summaryRows[0]
        : summaryRows;

      setSummary({
        CityName: summaryData?.CityName ?? "",
        FollowerCount: Number(summaryData?.FollowerCount ?? 0),
        FollowingCount: Number(summaryData?.FollowingCount ?? 0),
        NoteCount: Number(summaryData?.NoteCount ?? 0),
      });
    }

    setProfileLoading(false);
  }, [session?.user?.id]);

  const refreshProfileSummary = useCallback(async () => {
    if (!profile?.UserId) {
      return;
    }

    const { data: summaryRows, error: summaryError } = await supabase.rpc(
      "GetUserProfileSummary",
      { p_user_id: profile.UserId }
    );

    if (summaryError) {
      console.error("Profil özeti yenilenemedi:", summaryError);
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
  }, [profile?.UserId]);

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
      setCitiesError("Şehir listesi yüklenemedi.");
    } else {
      setCities(data ?? []);
    }

    setCitiesLoading(false);
  };

  const openProfileEditor = () => {
    setIsProfileEditOpen(true);
    loadCities();
  };

  const handleLogout = async () => {
    setAppMessage("");

    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error("Çıkış yapılamadı:", error);
      setAppMessage(error.message);
      return;
    }

    setActivePage("map");
    setProfile(null);
    setSummary(EMPTY_SUMMARY);
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
            <p>{profileError || "Bir hata oluştu."}</p>
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

  const pageContentClassName = [
    "page-content",
    activePage === "map" ? "page-content-map" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="app-shell">
      <header className="topbar">
        <button
          className="logo-button"
          type="button"
          onClick={() => setActivePage("map")}
        >
          Bizim Mekanlar
        </button>

        <nav className="desktop-nav" aria-label="Ana menü">
          <button
            type="button"
            className={activePage === "map" ? "nav-active" : ""}
            onClick={() => setActivePage("map")}
          >
            Harita
          </button>
          <button
            type="button"
            className={activePage === "list" ? "nav-active" : ""}
            onClick={() => setActivePage("list")}
          >
            Liste
          </button>
          <button
            type="button"
            className={activePage === "profile" ? "nav-active" : ""}
            onClick={() => setActivePage("profile")}
          >
            Profil
          </button>
        </nav>
      </header>

      {appMessage && (
        <div className="app-message" role="status">
          {appMessage}
        </div>
      )}

      <main className={pageContentClassName}>
        {activePage === "map" && (
          <MapPage onNoteCreated={refreshProfileSummary} />
        )}
        {activePage === "list" && <ListPage />}
        {activePage === "profile" && (
          <ProfilePage
            profile={profile}
            summary={summary}
            onEdit={openProfileEditor}
            onLogout={handleLogout}
          />
        )}
      </main>

      <nav className="bottom-nav" aria-label="Alt menü">
        <button
          type="button"
          className={activePage === "map" ? "bottom-nav-active" : ""}
          onClick={() => setActivePage("map")}
        >
          <span>⌖</span>
          Harita
        </button>
        <button
          type="button"
          className={activePage === "list" ? "bottom-nav-active" : ""}
          onClick={() => setActivePage("list")}
        >
          <span>☷</span>
          Liste
        </button>
        <button
          type="button"
          className={activePage === "profile" ? "bottom-nav-active" : ""}
          onClick={() => setActivePage("profile")}
        >
          <span>◉</span>
          Profil
        </button>
      </nav>

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
        />
      )}
    </div>
  );
}

function ListPage() {
  return (
    <section className="page-section">
      <div className="page-heading">
        <p className="eyebrow">GÜNLÜK</p>
        <h1>Mekanların</h1>
        <p>Kaydettiğin mekanlar, ziyaretler ve notlar burada listelenecek.</p>
      </div>

      <div className="empty-state">
        <div className="empty-icon">✦</div>
        <h2>Henüz mekan yok</h2>
        <p>İlk mekanı eklediğinde burada görünmeye başlayacak.</p>
      </div>
    </section>
  );
}

function ProfilePage({ profile, summary, onEdit, onLogout }) {
  const fullName = [profile.FirstName, profile.LastName]
    .filter(Boolean)
    .join(" ");
  const avatarLetter = (profile.Username || profile.FirstName || "K")
    .charAt(0)
    .toUpperCase();

  return (
    <section className="profile-page page-section">
      <div className="profile-card">
        <div className="profile-top">
          <div className="profile-avatar" aria-hidden="true">
            {avatarLetter}
          </div>

          <div className="profile-identity">
            <p className="eyebrow">{profile.Username}</p>
            <h1>{fullName || profile.Username}</h1>
          </div>
        </div>

        <div className="profile-stats" aria-label="Profil istatistikleri">
          <div>
            <strong>{summary.NoteCount}</strong>
            <span>Not</span>
          </div>
          <div>
            <strong>{summary.FollowerCount}</strong>
            <span>Takipçi</span>
          </div>
          <div>
            <strong>{summary.FollowingCount}</strong>
            <span>Takip</span>
          </div>
        </div>

        <div
          className="profile-public-details"
          aria-label="Herkese açık profil bilgileri"
        >
          {summary.CityName && <span>⌖ {summary.CityName}</span>}
          {profile.ZodiacSign && <span>✦ {profile.ZodiacSign}</span>}
        </div>

        <button className="profile-edit-button" type="button" onClick={onEdit}>
          Profili düzenle
        </button>

        <button className="logout-button" type="button" onClick={onLogout}>
          Çıkış yap
        </button>
      </div>
    </section>
  );
}

function ProfileEditModal({
  profile,
  cities,
  citiesLoading,
  citiesError,
  onClose,
  onSaved,
}) {
  const [form, setForm] = useState({
    username: profile.Username ?? "",
    firstName: profile.FirstName ?? "",
    lastName: profile.LastName ?? "",
    birthDate: profile.BirthDate ?? "",
    cityId: String(profile.CityId ?? ""),
  });
  const [usernameMessage, setUsernameMessage] = useState("");
  const [usernameAvailable, setUsernameAvailable] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === "Escape" && !saving) {
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
  }, [onClose, saving]);

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
      setUsernameMessage("Mevcut kullanıcı adın.");
      return true;
    }

    if (!/^[a-z0-9._]{3,30}$/.test(normalizedUsername)) {
      setUsernameAvailable(false);
      setUsernameMessage(
        "3-30 karakter kullan: harf, rakam, nokta veya alt çizgi."
      );
      return false;
    }

    const { data, error } = await supabase.rpc("IsUsernameAvailable", {
      p_username: normalizedUsername,
    });

    if (error) {
      console.error("Kullanıcı adı kontrolü yapılamadı:", error);
      setUsernameAvailable(null);
      setUsernameMessage("Kullanıcı adı şu an kontrol edilemedi.");
      return false;
    }

    const isAvailable = Boolean(data);
    setUsernameAvailable(isAvailable);
    setUsernameMessage(
      isAvailable ? "Bu kullanıcı adı kullanılabilir." : "Bu kullanıcı adı alınmış."
    );

    return isAvailable;
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    setSaveError("");

    if (!form.firstName.trim()) {
      setSaveError("İsim zorunlu.");
      return;
    }

    if (!form.birthDate) {
      setSaveError("Doğum tarihi zorunlu.");
      return;
    }

    if (!form.cityId) {
      setSaveError("Şehir seçmelisin.");
      return;
    }

    const usernameIsValid = await checkUsername();

    if (!usernameIsValid) {
      setSaveError("Devam etmek için kullanılabilir bir kullanıcı adı seç.");
      return;
    }

    setSaving(true);

    const { error } = await supabase.rpc("UpdateMyProfile", {
      p_username: form.username.trim().toLowerCase(),
      p_first_name: form.firstName.trim(),
      p_last_name: form.lastName.trim() || null,
      p_birth_date: form.birthDate,
      p_city_id: Number(form.cityId),
    });

    if (error) {
      console.error("Profil güncellenemedi:", error);
      setSaveError(error.message || "Profil güncellenemedi.");
      setSaving(false);
      return;
    }

    await onSaved();
  };

  const handleBackdropMouseDown = (event) => {
    if (!saving && event.target === event.currentTarget) {
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
            disabled={saving}
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
              {usernameMessage}
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
                onChange={(event) => updateField("firstName", event.target.value)}
              />
            </label>

            <label>
              Soyisim <span>(opsiyonel)</span>
              <input
                type="text"
                value={form.lastName}
                autoComplete="family-name"
                disabled={saving}
                onChange={(event) => updateField("lastName", event.target.value)}
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
                onChange={(event) => updateField("birthDate", event.target.value)}
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

          {citiesError && <p className="profile-save-error">{citiesError}</p>}
          {saveError && <p className="profile-save-error">{saveError}</p>}

          <div className="profile-modal-actions">
            <button
              className="profile-modal-cancel"
              type="button"
              onClick={onClose}
              disabled={saving}
            >
              Vazgeç
            </button>
            <button
              className="profile-modal-save"
              type="submit"
              disabled={saving || citiesLoading}
            >
              {saving ? "Kaydediliyor..." : "Kaydet"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default App;
