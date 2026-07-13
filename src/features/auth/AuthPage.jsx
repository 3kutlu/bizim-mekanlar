/* Feature module: extracted without changing UI behavior. */

import { useEffect, useRef, useState } from "react";
import { supabase } from "../../supabase.js";
import AppIcon from "../../components/AppIcon.jsx";
import "../../css/auth.css";

const usernamePattern = /^[a-z0-9._]{3,30}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_LENGTH = 6;
const OTP_PATTERN = new RegExp(`^\\d{${OTP_LENGTH}}$`);
const OTP_PLACEHOLDER = "0".repeat(OTP_LENGTH);
const SIGNUP_DEVICE_STORAGE_KEY = "bm_signup_device_v1";
const SUPPORT_MESSAGE_CODES = new Set([
  "EMAIL_NOT_ALLOWED",
  "SIGNUP_TEMPORARILY_BLOCKED",
]);
const SUPPORT_MAILTO =
  "mailto:3kutlu@gmail.com" +
  "?subject=" +
  encodeURIComponent("Bizim Mekanlar e-posta kayıt sorunu") +
  "&body=" +
  encodeURIComponent(
    "Merhaba, Bizim Mekanlar'a kaydolurken e-posta adresimin kabul edilmediği uyarısını aldım."
  );

function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeUsername(value) {
  return String(value ?? "").trim().toLowerCase();
}

function createSignupDeviceToken() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  const randomPart = Math.random().toString(36).slice(2);
  return `${Date.now().toString(36)}-${randomPart}-${randomPart}`;
}

function readOrCreateSignupDeviceToken() {
  const fallbackToken = createSignupDeviceToken();

  if (typeof window === "undefined") {
    return fallbackToken;
  }

  try {
    const currentToken = window.localStorage.getItem(
      SIGNUP_DEVICE_STORAGE_KEY
    );

    if (currentToken && currentToken.length >= 16) {
      return currentToken;
    }

    window.localStorage.setItem(SIGNUP_DEVICE_STORAGE_KEY, fallbackToken);
    return fallbackToken;
  } catch {
    return fallbackToken;
  }
}

function getSignupValidation({
  username,
  firstName,
  birthDate,
  cityId,
  email,
}) {
  if (!usernamePattern.test(normalizeUsername(username))) {
    return "Kullanıcı adı 3-30 karakter olmalı; harf, rakam, nokta ve alt çizgi kullanabilirsin.";
  }

  if (!String(firstName ?? "").trim()) {
    return "İsim zorunlu.";
  }

  if (!birthDate) {
    return "Doğum tarihi zorunlu.";
  }

  if (birthDate > new Date().toISOString().slice(0, 10)) {
    return "Doğum tarihi gelecekte olamaz.";
  }

  if (!cityId) {
    return "Şehir seçmelisin.";
  }

  if (!emailPattern.test(normalizeEmail(email))) {
    return "Geçerli bir e-posta adresi yazmalısın.";
  }

  return "";
}

function getLoginValidation(identifier) {
  const normalizedIdentifier = String(identifier ?? "").trim().toLowerCase();

  if (!normalizedIdentifier) {
    return "E-posta adresini veya kullanıcı adını yaz.";
  }

  if (
    !emailPattern.test(normalizedIdentifier) &&
    !usernamePattern.test(normalizedIdentifier)
  ) {
    return "Geçerli bir e-posta adresi veya kullanıcı adı yaz.";
  }

  return "";
}

async function getFunctionErrorPayload(error) {
  try {
    const response = error?.context;

    if (response && typeof response.clone === "function") {
      const body = await response.clone().json();

      return {
        message: String(body?.message ?? "").trim(),
        code: String(body?.code ?? "").trim(),
      };
    }
  } catch {
    // Function error body her zaman JSON olmayabilir.
  }

  return { message: "", code: "" };
}

function getSafeAuthErrorMessage(message, fallbackMessage) {
  const normalizedMessage = String(message ?? "").trim();

  if (!normalizedMessage) {
    return fallbackMessage;
  }

  const lowerMessage = normalizedMessage.toLowerCase();

  if (
    lowerMessage.includes("rate limit") ||
    lowerMessage.includes("too many requests") ||
    lowerMessage.includes("security purposes") ||
    lowerMessage.includes("email rate limit exceeded") ||
    lowerMessage.includes("over_email_send_rate_limit")
  ) {
    return "Çok fazla kod istedin. Lütfen kısa bir süre bekleyip tekrar dene.";
  }

  if (
    lowerMessage.includes("supabase") ||
    lowerMessage.includes("edge function") ||
    lowerMessage.includes("logs ekran") ||
    lowerMessage.includes("function returned") ||
    lowerMessage.includes("failed to fetch")
  ) {
    return fallbackMessage;
  }

  return normalizedMessage;
}

async function invokePasswordlessAuth(body) {
  const { data, error } = await supabase.functions.invoke(
    "request-auth-otp",
    { body }
  );

  if (error) {
    const fallbackMessage =
      "Kod işlemi şu an tamamlanamadı. Lütfen kısa süre sonra tekrar dene.";
    const responsePayload = await getFunctionErrorPayload(error);
    const authError = new Error(
      getSafeAuthErrorMessage(
        responsePayload.message || error?.message,
        fallbackMessage
      )
    );

    authError.code = responsePayload.code;
    throw authError;
  }

  return data ?? {};
}

export default function AuthPage() {
  const [mode, setMode] = useState("login");
  const [step, setStep] = useState("form");

  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [email, setEmail] = useState("");

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

  const [pendingIdentifier, setPendingIdentifier] = useState("");
  const [otp, setOtp] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [messageCode, setMessageCode] = useState("");

  const otpInputRef = useRef(null);
  const submissionLockRef = useRef(false);
  const signupDeviceTokenRef = useRef("");
  const today = new Date().toISOString().slice(0, 10);
  const isOtpStep = step === "otp";
  const shouldShowSupportLink = SUPPORT_MESSAGE_CODES.has(messageCode);

  const getSignupDeviceToken = () => {
    if (!signupDeviceTokenRef.current) {
      signupDeviceTokenRef.current = readOrCreateSignupDeviceToken();
    }

    return signupDeviceTokenRef.current;
  };

  const clearMessage = () => {
    setMessage("");
    setMessageCode("");
  };

  const showError = (error, fallbackMessage) => {
    setMessage(
      getSafeAuthErrorMessage(error?.message, fallbackMessage)
    );
    setMessageCode(String(error?.code ?? ""));
  };

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
        setMessage("Şehir listesi yüklenemedi.");
        setMessageCode("");
      } else {
        setCities(data ?? []);
      }

      setCitiesLoading(false);
    };

    void loadCities();
  }, [mode, cities.length, citiesLoading]);

  useEffect(() => {
    if (isOtpStep) {
      window.setTimeout(() => otpInputRef.current?.focus(), 0);
    }
  }, [isOtpStep]);

  const beginSubmission = () => {
    if (submissionLockRef.current) {
      return false;
    }

    submissionLockRef.current = true;
    setSubmitting(true);
    return true;
  };

  const endSubmission = () => {
    submissionLockRef.current = false;
    setSubmitting(false);
  };

  const checkUsernameAvailability = async () => {
    const normalizedUsername = normalizeUsername(username);

    if (!usernamePattern.test(normalizedUsername)) {
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
      console.error("Username kontrolü yapılamadı:", error);
      setUsernameAvailable(null);
      setUsernameMessage("Kullanıcı adı şu an kontrol edilemedi.");
      return false;
    }

    setUsernameAvailable(Boolean(data));
    setUsernameMessage(
      data ? "Bu kullanıcı adı kullanılabilir." : "Bu kullanıcı adı alınmış."
    );

    return Boolean(data);
  };

  const requestOtp = async () => {
    if (!beginSubmission()) {
      return;
    }

    clearMessage();

    try {
      const loginValidation =
        mode === "login" ? getLoginValidation(loginIdentifier) : "";

      if (loginValidation) {
        setMessage(loginValidation);
        return;
      }

      if (mode === "signup") {
        const validationMessage = getSignupValidation({
          username,
          firstName,
          birthDate,
          cityId,
          email,
        });

        if (validationMessage) {
          setMessage(validationMessage);
          return;
        }

        const isAvailable = await checkUsernameAvailability();

        if (!isAvailable) {
          setMessage("Başka bir kullanıcı adı seçmelisin.");
          return;
        }
      }

      const normalizedLoginIdentifier = String(loginIdentifier)
        .trim()
        .toLowerCase();

      const normalizedEmail = normalizeEmail(email);

      await invokePasswordlessAuth(
        mode === "signup"
          ? {
              action: "signup",
              email: normalizedEmail,
              username: normalizeUsername(username),
              firstName: String(firstName).trim(),
              lastName: String(lastName).trim() || null,
              birthDate,
              cityId: Number(cityId),
              accountVisibilityCode: isPrivateAccount ? "PRIVATE" : "PUBLIC",
              deviceToken: getSignupDeviceToken(),
            }
          : {
              action: "login",
              identifier: normalizedLoginIdentifier,
            }
      );

      setPendingIdentifier(
        mode === "signup" ? normalizedEmail : normalizedLoginIdentifier
      );
      setOtp("");
      setStep("otp");
      setMessage("6 haneli kod e-posta adresine gönderildi.");
      setMessageCode("");
    } catch (error) {
      console.error("OTP gönderilemedi:", error);
      showError(
        error,
        "Kod şu an gönderilemedi. Lütfen kısa süre sonra tekrar dene."
      );
    } finally {
      endSubmission();
    }
  };

  const verifyOtp = async (event) => {
    event.preventDefault();

    if (!beginSubmission()) {
      return;
    }

    clearMessage();

    try {
      if (!OTP_PATTERN.test(otp)) {
        setMessage("E-postana gelen 6 haneli kodu yaz.");
        return;
      }

      if (!pendingIdentifier) {
        setMessage("Oturum bilgisi bulunamadı. Kodu yeniden iste.");
        setStep("form");
        return;
      }

      const result = await invokePasswordlessAuth({
        action: "verify",
        identifier: pendingIdentifier,
        token: otp,
      });

      const accessToken = result?.access_token;
      const refreshToken = result?.refresh_token;

      if (!accessToken || !refreshToken) {
        throw new Error("Oturum oluşturulamadı. Kodu yeniden iste.");
      }

      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (error) {
        throw error;
      }

      // App.jsx oturum değişimini dinliyor; başarılı setSession sonrası uygulama açılır.
    } catch (error) {
      console.error("OTP doğrulanamadı:", error);
      showError(
        error,
        "Kod geçersiz veya süresi dolmuş. Yeni bir kod iste."
      );
    } finally {
      endSubmission();
    }
  };

  const resendOtp = async () => {
    if (!pendingIdentifier || !beginSubmission()) {
      return;
    }

    clearMessage();

    try {
      await invokePasswordlessAuth(
        mode === "signup"
          ? {
              action: "signup",
              email: normalizeEmail(email),
              username: normalizeUsername(username),
              firstName: String(firstName).trim(),
              lastName: String(lastName).trim() || null,
              birthDate,
              cityId: Number(cityId),
              accountVisibilityCode: isPrivateAccount ? "PRIVATE" : "PUBLIC",
              deviceToken: getSignupDeviceToken(),
            }
          : {
              action: "login",
              identifier: pendingIdentifier,
            }
      );

      setOtp("");
      setMessage("Yeni kod e-posta adresine gönderildi.");
      setMessageCode("");
    } catch (error) {
      console.error("OTP yeniden gönderilemedi:", error);
      showError(
        error,
        "Kod şu an yeniden gönderilemedi. Lütfen kısa süre sonra tekrar dene."
      );
    } finally {
      endSubmission();
    }
  };

  const returnToForm = () => {
    if (submitting || submissionLockRef.current) {
      return;
    }

    setStep("form");
    setOtp("");
    setPendingIdentifier("");
    clearMessage();
  };

  const switchMode = () => {
    if (submitting || submissionLockRef.current) {
      return;
    }

    setMode((currentMode) =>
      currentMode === "login" ? "signup" : "login"
    );
    setStep("form");
    setOtp("");
    setPendingIdentifier("");
    clearMessage();
    setUsernameMessage("");
    setUsernameAvailable(null);
  };

  const handleOtpChange = (event) => {
    setOtp(event.target.value.replace(/\D/g, "").slice(0, OTP_LENGTH));
  };

  const renderMessage = () => {
    if (!message) {
      return null;
    }

    return (
      <div className="auth-message" role="status">
        <span>{message}</span>

        {shouldShowSupportLink && (
          <a href={SUPPORT_MAILTO}>
            Bir yanlışlık olduğunu düşünüyorsan bizimle iletişime geç.
          </a>
        )}
      </div>
    );
  };

  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="brand-small">BİZİM MEKANLAR</p>

        {!isOtpStep ? (
          <>
            <h1>{mode === "login" ? "Hoş geldin." : "Aramıza katıl."}</h1>

            <p className="auth-description">
              {mode === "login"
                ? "Giriş yapmak için e-posta adresini veya kullanıcı adını yaz."
                : "Gezdiğiniz mekanları birlikte kaydedin."}
            </p>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                void requestOtp();
              }}
            >
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
                      disabled={submitting}
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
                      {usernameMessage}
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
                        disabled={submitting}
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
                        disabled={submitting}
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
                        disabled={submitting}
                        onChange={(event) => setBirthDate(event.target.value)}
                      />
                    </label>

                    <label>
                      Şehir
                      <select
                        value={cityId}
                        disabled={citiesLoading || submitting}
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
                      disabled={submitting}
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

              {mode === "login" ? (
                <label>
                  E-posta veya kullanıcı adı
                  <input
                    type="text"
                    placeholder="smoke veya ornek@mail.com"
                    value={loginIdentifier}
                    autoComplete="username"
                    autoCapitalize="none"
                    disabled={submitting}
                    onChange={(event) =>
                      setLoginIdentifier(event.target.value.toLowerCase())
                    }
                  />
                </label>
              ) : (
                <label>
                  E-posta
                  <input
                    type="email"
                    placeholder="ornek@mail.com"
                    value={email}
                    autoComplete="email"
                    disabled={submitting}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </label>
              )}

              {mode === "signup" && (
                <p className="auth-passwordless-note">
                  <span aria-hidden="true"><AppIcon name="star" /></span>
                  Şifre oluşturman gerekmiyor. Girişte e-posta adresine tek
                  kullanımlık 6 haneli kod göndeririz.
                </p>
              )}

              <button
                className="primary-button"
                type="submit"
                disabled={submitting || (mode === "signup" && citiesLoading)}
              >
                {submitting
                  ? "Kod gönderiliyor..."
                  : mode === "login"
                    ? "Kod gönder"
                    : "Kodla kayıt ol"}
              </button>
            </form>

            {renderMessage()}

            <button
              className="text-button"
              type="button"
              disabled={submitting}
              onClick={switchMode}
            >
              {mode === "login"
                ? "Hesabın yok mu? Kayıt ol"
                : "Hesabın var mı? Giriş yap"}
            </button>
          </>
        ) : (
          <>
            <button
              className="auth-back-button"
              type="button"
              disabled={submitting}
              onClick={returnToForm}
            >
              <AppIcon name="arrow-left" />
              Geri
            </button>

            <h1>E-postandaki kodu gir.</h1>
            <p className="auth-description">
              Sana gönderdiğimiz 6 haneli tek kullanımlık kodla güvenle giriş
              yapabilirsin.
            </p>

            <form onSubmit={verifyOtp}>
              <label>
                Doğrulama kodu
                <input
                  ref={otpInputRef}
                  className="auth-otp-input"
                  type="text"
                  value={otp}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  maxLength={OTP_LENGTH}
                  placeholder={OTP_PLACEHOLDER}
                  disabled={submitting}
                  onChange={handleOtpChange}
                />
              </label>

              <button
                className="primary-button"
                type="submit"
                disabled={submitting || otp.length !== OTP_LENGTH}
              >
                {submitting ? "Doğrulanıyor..." : "Giriş yap"}
              </button>
            </form>

            {renderMessage()}

            <button
              className="text-button"
              type="button"
              disabled={submitting}
              onClick={() => void resendOtp()}
            >
              Kodu yeniden gönder
            </button>
          </>
        )}
      </section>
    </main>
  );
}
