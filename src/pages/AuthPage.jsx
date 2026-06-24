import { useState } from "react";
import "../css/auth.css";

const knownErrors = {
  "Invalid login credentials": "E-posta veya şifre yanlış.",
  "User already registered": "Bu e-posta zaten kayıtlı.",
  "Email not confirmed": "Önce e-posta adresini doğrulaman gerekiyor.",
};

function getErrorMessage(error) {
  return knownErrors[error?.message] || error?.message || "Bir hata oluştu.";
}

function AuthPage({ onSignIn, onSignUp, initialError = "" }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  const isLogin = mode === "login";

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage("");

    const cleanEmail = email.trim();

    if (!cleanEmail || !password) {
      setMessage("E-posta ve şifre zorunlu.");
      return;
    }

    if (password.length < 6) {
      setMessage("Şifre en az 6 karakter olmalı.");
      return;
    }

    setSubmitting(true);

    try {
      if (isLogin) {
        const { error } = await onSignIn(cleanEmail, password);

        if (error) {
          throw error;
        }

        return;
      }

      const { data, error } = await onSignUp(cleanEmail, password);

      if (error) {
        throw error;
      }

      setMessage(
        data.session
          ? "Kayıt başarılı. Giriş yapıldı."
          : "Kayıt oluşturuldu. E-posta doğrulama bağlantısını kontrol et."
      );
    } catch (error) {
      console.error("Kimlik doğrulama hatası:", error);
      setMessage(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const toggleMode = () => {
    setMode((currentMode) => (currentMode === "login" ? "signup" : "login"));
    setMessage("");
  };

  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="brand-small">BİZİM MEKANLAR</p>

        <h1>{isLogin ? "Hoş geldin." : "Aramıza katıl."}</h1>

        <p className="auth-description">
          Gezdiğiniz mekanları birlikte kaydedin.
        </p>

        <form onSubmit={handleSubmit}>
          <label htmlFor="auth-email">E-posta</label>
          <input
            id="auth-email"
            type="email"
            autoComplete="email"
            placeholder="ornek@mail.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />

          <label htmlFor="auth-password">Şifre</label>
          <input
            id="auth-password"
            type="password"
            autoComplete={isLogin ? "current-password" : "new-password"}
            placeholder="En az 6 karakter"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />

          <button
            className="primary-button"
            type="submit"
            disabled={submitting}
          >
            {submitting ? "Bekle..." : isLogin ? "Giriş Yap" : "Kayıt Ol"}
          </button>
        </form>

        {(message || initialError) && (
          <p className="auth-message">{message || initialError}</p>
        )}

        <button className="text-button" type="button" onClick={toggleMode}>
          {isLogin
            ? "Hesabın yok mu? Kayıt ol"
            : "Hesabın var mı? Giriş yap"}
        </button>
      </section>
    </main>
  );
}

export default AuthPage;
