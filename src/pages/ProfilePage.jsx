import { useState } from "react";
import "../css/profile-page.css";

function ProfilePage({ user, onLogout }) {
  const [logoutError, setLogoutError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);

  const email = user.email || "";
  const username = email.split("@")[0] || "Kullanıcı";

  const handleLogout = async () => {
    setLogoutError("");
    setLoggingOut(true);

    try {
      await onLogout();
    } catch (error) {
      console.error("Çıkış yapılırken hata oluştu:", error);
      setLogoutError(error.message || "Çıkış yapılırken bir hata oluştu.");
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <section className="page-section">
      <div className="profile-card">
        <div className="profile-avatar" aria-hidden="true">
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

        {logoutError && <p className="auth-message">{logoutError}</p>}

        <button
          className="logout-button"
          type="button"
          disabled={loggingOut}
          onClick={handleLogout}
        >
          {loggingOut ? "Çıkış yapılıyor..." : "Çıkış yap"}
        </button>
      </div>
    </section>
  );
}

export default ProfilePage;
