import { useEffect, useState } from "react";
import { supabase } from "./supabase.js";
import MapPage from "./MapPage.jsx";
import "./App.css";

function App() {
  const [session, setSession] = useState(null);
  const [activePage, setActivePage] = useState("map");
  const [loading, setLoading] = useState(true);

  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const loadSession = async () => {
      const { data, error } = await supabase.auth.getSession();

      if (error) {
        console.error(error);
        setMessage(error.message);
      }

      setSession(data.session);
      setLoading(false);
    };

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage("");

    if (!email || !password) {
      setMessage("E-posta ve şifre zorunlu.");
      return;
    }

    if (password.length < 6) {
      setMessage("Şifre en az 6 karakter olmalı.");
      return;
    }

    setSubmitting(true);

    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });

        if (error) throw error;

        if (data.session) {
          setMessage("Kayıt başarılı. Giriş yapıldı.");
        } else {
          setMessage(
            "Kayıt oluşturuldu. E-posta doğrulama bağlantısını kontrol et."
          );
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;
      }
    } catch (error) {
      console.error(error);

      const knownErrors = {
        "Invalid login credentials": "E-posta veya şifre yanlış.",
        "User already registered": "Bu e-posta zaten kayıtlı.",
        "Email not confirmed": "Önce e-posta adresini doğrulaman gerekiyor.",
      };

      setMessage(
        knownErrors[error.message] ||
          error.message ||
          "Bir hata oluştu."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();

    if (error) {
      setMessage(error.message);
      return;
    }

    setActivePage("map");
  };

  if (loading) {
    return <main className="loading-screen">Yükleniyor...</main>;
  }

  if (!session?.user) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <p className="brand-small">BİZİM MEKANLAR</p>

          <h1>{mode === "login" ? "Hoş geldin." : "Aramıza katıl."}</h1>

          <p className="auth-description">
            Gezdiğiniz mekanları birlikte kaydedin.
          </p>

          <form onSubmit={handleSubmit}>
            <label>E-posta</label>
            <input
              type="email"
              placeholder="ornek@mail.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />

            <label>Şifre</label>
            <input
              type="password"
              placeholder="En az 6 karakter"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />

            <button
              className="primary-button"
              type="submit"
              disabled={submitting}
            >
              {submitting
                ? "Bekle..."
                : mode === "login"
                  ? "Giriş Yap"
                  : "Kayıt Ol"}
            </button>
          </form>

          {message && <p className="auth-message">{message}</p>}

          <button
            className="text-button"
            type="button"
            onClick={() => {
              setMode(mode === "login" ? "signup" : "login");
              setMessage("");
            }}
          >
            {mode === "login"
              ? "Hesabın yok mu? Kayıt ol"
              : "Hesabın var mı? Giriş yap"}
          </button>
        </section>
      </main>
    );
  }

  const username = session.user.email?.split("@")[0] || "Kullanıcı";

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

        <nav className="desktop-nav">
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

      <main className="page-content">
        {activePage === "map" && <MapPage />}

        {activePage === "list" && <ListPage />}

        {activePage === "profile" && (
          <ProfilePage
            email={session.user.email}
            username={username}
            onLogout={handleLogout}
          />
        )}
      </main>

      <nav className="bottom-nav">
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
    </div>
  );
}

function ListPage() {
  return (
    <section className="page-section">
      <div className="page-heading">
        <p className="eyebrow">GÜNLÜK</p>
        <h1>Mekanların</h1>
        <p>Kaydettiğiniz mekanlar, ziyaretler ve notlar burada listelenecek.</p>
      </div>

      <div className="empty-state">
        <div className="empty-icon">✦</div>
        <h2>Henüz mekan yok</h2>
        <p>İlk mekanı eklediğinizde burada görünmeye başlayacak.</p>
      </div>
    </section>
  );
}

function ProfilePage({ email, username, onLogout }) {
  return (
    <section className="page-section">
      <div className="profile-card">
        <div className="profile-avatar">
          {username.charAt(0).toUpperCase()}
        </div>

        <p className="eyebrow">HESABIM</p>
        <h1>{username}</h1>
        <p className="profile-email">{email}</p>

        <div className="profile-stats">
          <div>
            <strong>0</strong>
            <span>Mekan</span>
          </div>

          <div>
            <strong>0</strong>
            <span>Yorum</span>
          </div>

          <div>
            <strong>0</strong>
            <span>Favori</span>
          </div>
        </div>

        <button className="secondary-button" type="button">
          Profili düzenle
        </button>

        <button className="logout-button" type="button" onClick={onLogout}>
          Çıkış yap
        </button>
      </div>
    </section>
  );
}

export default App;