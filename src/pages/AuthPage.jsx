import { useEffect, useState } from "react";
import { supabase } from "../supabase.js";
import {
  getErrorMessageKey,
  MESSAGE_KEY,
  t,
} from "../i18n/messages.js";
import "../css/auth.css";

const usernamePattern = /^[a-z0-9._]{3,30}$/;

function getSignupValidation({
  username,
  firstName,
  birthDate,
  cityId,
  password,
}) {
  if (!usernamePattern.test(username.trim().toLowerCase())) {
    return MESSAGE_KEY.USERNAME_INVALID_FORMAT;
  }

  if (!firstName.trim()) {
    return MESSAGE_KEY.PROFILE_FIRST_NAME_REQUIRED;
  }

  if (!birthDate) {
    return MESSAGE_KEY.AUTH_BIRTH_DATE_REQUIRED;
  }

  if (birthDate > new Date().toISOString().slice(0, 10)) {
    return MESSAGE_KEY.AUTH_BIRTH_DATE_FUTURE;
  }

  if (!cityId) {
    return MESSAGE_KEY.AUTH_CITY_REQUIRED;
  }

  if (password.length < 6) {
    return MESSAGE_KEY.AUTH_PASSWORD_MIN_LENGTH;
  }

  return "";
}

export default function AuthPage() {
  const [mode, setMode] = useState("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [username, setUsername] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [cityId, setCityId] = useState("");
  const [isPrivateAccount, setIsPrivateAccount] = useState(false);

  const [cities, setCities] = useState([]);
  const [citiesLoading, setCitiesLoading] = useState(false);

  const [usernameMessage, setUsernameMessage] = useState("");
  const [usernameAvailable, setUsernameAvailable] = useState(null);

  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (mode !== "signup" || cities.length > 0 || citiesLoading) {
      return;
    }

    const loadCities = async () => {
      setCitiesLoading(true);

      const { data, error } = await supabase
        .from("Cities")
        .select("CityId, PlateCode, Name")
        .eq("IsActive", true)
        .order("PlateCode");

      if (error) {
        console.error("Şehirler alınamadı:", error);
        setMessage(MESSAGE_KEY.CITIES_LOAD_FAILED);
      } else {
        setCities(data ?? []);
      }

      setCitiesLoading(false);
    };

    loadCities();
  }, [mode, cities.length, citiesLoading]);

  const checkUsernameAvailability = async () => {
    const normalizedUsername = username.trim().toLowerCase();

    if (!usernamePattern.test(normalizedUsername)) {
      setUsernameAvailable(false);
      setUsernameMessage(MESSAGE_KEY.USERNAME_INVALID_FORMAT);
      return false;
    }

    const { data, error } = await supabase.rpc("IsUsernameAvailable", {
      p_username: normalizedUsername,
    });

    if (error) {
      console.error("Username kontrolü yapılamadı:", error);
      setUsernameAvailable(null);
      setUsernameMessage(MESSAGE_KEY.USERNAME_CHECK_FAILED);
      return false;
    }

    setUsernameAvailable(Boolean(data));
    setUsernameMessage(
      data ? MESSAGE_KEY.USERNAME_AVAILABLE : MESSAGE_KEY.USERNAME_TAKEN
    );

    return Boolean(data);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage("");

    if (!email.trim() || !password) {
      setMessage(MESSAGE_KEY.AUTH_EMAIL_PASSWORD_REQUIRED);
      return;
    }

    if (mode === "signup") {
      const validationMessage = getSignupValidation({
        username,
        firstName,
        birthDate,
        cityId,
        password,
      });

      if (validationMessage) {
        setMessage(validationMessage);
        return;
      }
    } else if (password.length < 6) {
      setMessage(MESSAGE_KEY.AUTH_PASSWORD_MIN_LENGTH);
      return;
    }

    setSubmitting(true);

    try {
      if (mode === "signup") {
        const isAvailable = await checkUsernameAvailability();

        if (!isAvailable) {
          setMessage(MESSAGE_KEY.AUTH_USERNAME_MUST_BE_AVAILABLE);
          return;
        }

        const { data, error } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: {
              username: username.trim().toLowerCase(),
              firstName: firstName.trim(),
              lastName: lastName.trim() || null,
              birthDate,
              cityId: Number(cityId),
              accountVisibilityCode: isPrivateAccount ? "PRIVATE" : "PUBLIC",
            },
          },
        });

        if (error) {
          throw error;
        }

        if (!data.session) {
          setMode("login");
          setMessage(MESSAGE_KEY.AUTH_ACCOUNT_CREATED_VERIFY_EMAIL);
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });

        if (error) {
          throw error;
        }
      }
    } catch (error) {
      console.error(error);

      setMessage(
        getErrorMessageKey(error, MESSAGE_KEY.AUTH_SUBMIT_FAILED)
      );
    } finally {
      setSubmitting(false);
    }
  };

  const switchMode = () => {
    setMode((currentMode) =>
      currentMode === "login" ? "signup" : "login"
    );

    setMessage("");
    setUsernameMessage("");
    setUsernameAvailable(null);
  };

  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="brand-small">BİZİM MEKANLAR</p>

        <h1>{mode === "login" ? "Hoş geldin." : "Aramıza katıl."}</h1>

        <p className="auth-description">
          Gezdiğiniz mekanları birlikte kaydedin.
        </p>

        <form onSubmit={handleSubmit}>
          {mode === "signup" && (
            <div className="auth-signup-fields">
              <label>
                Kullanıcı adı
                <input
                  type="text"
                  placeholder="smoke"
                  value={username}
                  minLength="3"
                  maxLength="30"
                  autoComplete="username"
                  onBlur={checkUsernameAvailability}
                  onChange={(event) => {
                    setUsername(event.target.value.toLowerCase());
                    setUsernameAvailable(null);
                    setUsernameMessage("");
                  }}
                />
              </label>

              {usernameMessage && (
                <p
                  className={`auth-field-message ${
                    usernameAvailable === false ? "auth-field-error" : ""
                  }`}
                >
                  {t(usernameMessage)}
                </p>
              )}

              <div className="auth-form-row">
                <label>
                  İsim
                  <input
                    type="text"
                    placeholder="Adın"
                    value={firstName}
                    autoComplete="given-name"
                    onChange={(event) => setFirstName(event.target.value)}
                  />
                </label>

                <label>
                  Soyisim <span className="optional-text">(opsiyonel)</span>
                  <input
                    type="text"
                    placeholder="Soyadın"
                    value={lastName}
                    autoComplete="family-name"
                    onChange={(event) => setLastName(event.target.value)}
                  />
                </label>
              </div>

              <div className="auth-form-row">
                <label>
                  Doğum tarihi
                  <input
                    type="date"
                    value={birthDate}
                    max={today}
                    onChange={(event) => setBirthDate(event.target.value)}
                  />
                </label>

                <label>
                  Şehir
                  <select
                    value={cityId}
                    disabled={citiesLoading}
                    onChange={(event) => setCityId(event.target.value)}
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

              <label className="auth-checkbox">
                <input
                  type="checkbox"
                  checked={isPrivateAccount}
                  onChange={(event) =>
                    setIsPrivateAccount(event.target.checked)
                  }
                />

                <span>
                  <strong>Gizli hesap</strong>
                  <small>
                    Notların ve takip listelerin yalnızca kabul ettiğin
                    takipçilere görünür.
                  </small>
                </span>
              </label>
            </div>
          )}

          <label>
            E-posta
            <input
              type="email"
              placeholder="ornek@mail.com"
              value={email}
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>

          <label>
            Şifre
            <input
              type="password"
              placeholder="En az 6 karakter"
              value={password}
              minLength="6"
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          <button
            className="primary-button"
            type="submit"
            disabled={submitting || (mode === "signup" && citiesLoading)}
          >
            {submitting
              ? "Kaydediliyor..."
              : mode === "login"
                ? "Giriş Yap"
                : "Hesap Oluştur"}
          </button>
        </form>

        {message && (
          <p className="auth-message" role="status">
            {t(message)}
          </p>
        )}

        <button className="text-button" type="button" onClick={switchMode}>
          {mode === "login"
            ? "Hesabın yok mu? Kayıt ol"
            : "Hesabın var mı? Giriş yap"}
        </button>
      </section>
    </main>
  );
}
