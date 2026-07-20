import { createClient } from "npm:@supabase/supabase-js@2";

type Payload = Record<string, unknown>;

type EmailDomainRow = {
  EmailDomainId: number;
  Name: string;
  AllowedEmailDomain: boolean;
  SourceCode: "MANUAL" | "DEBOUNCE";
  LastCheckedDate: string | null;
};

type SignupBlockRow = {
  BlockTypeCode: "DEVICE" | "IP" | null;
  BlockedUntil: string | null;
};

type RejectedSignupRow = {
  AttemptCount: number;
  BlockTypeCode: "DEVICE" | "IP" | null;
  BlockedUntil: string | null;
};

const usernamePattern = /^[a-z0-9._]{3,30}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const deviceTokenPattern = /^[a-zA-Z0-9._:-]{16,200}$/;
const OTP_LENGTH = 6;
const OTP_PATTERN = new RegExp(`^\\d{${OTP_LENGTH}}$`);
const DOMAIN_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const DISPOSABLE_API_TIMEOUT_MS = 3_000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  });
}

function getDefaultProjectKey(
  groupedEnvironmentName: string,
  legacyEnvironmentName: string
) {
  const grouped = Deno.env.get(groupedEnvironmentName);

  if (grouped) {
    try {
      const parsed = JSON.parse(grouped) as Record<string, unknown>;

      if (typeof parsed.default === "string" && parsed.default) {
        return parsed.default;
      }

      const firstStringValue = Object.values(parsed).find(
        (value): value is string => typeof value === "string" && Boolean(value)
      );

      if (firstStringValue) {
        return firstStringValue;
      }
    } catch {
      // Legacy variable'a düş.
    }
  }

  const legacy = Deno.env.get(legacyEnvironmentName);

  if (!legacy) {
    throw new Error(
      `${groupedEnvironmentName} veya ${legacyEnvironmentName} bulunamadı.`
    );
  }

  return legacy;
}

const supabaseUrl = Deno.env.get("SUPABASE_URL");

if (!supabaseUrl) {
  throw new Error("SUPABASE_URL bulunamadı.");
}

const publishableKey = getDefaultProjectKey(
  "SUPABASE_PUBLISHABLE_KEYS",
  "SUPABASE_ANON_KEY"
);

const secretKey = getDefaultProjectKey(
  "SUPABASE_SECRET_KEYS",
  "SUPABASE_SERVICE_ROLE_KEY"
);

// Ayrı secret tanımlanırsa onu kullanır. Tanımlı değilse mevcut secret key
// yalnızca hash tuzu olarak kullanılır; açık IP/cihaz bilgisi kaydedilmez.
const signupSecurityHashSecret =
  Deno.env.get("SIGNUP_SECURITY_HASH_SECRET")?.trim() || secretKey;

const authClient = createClient(supabaseUrl, publishableKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});

const adminClient = createClient(supabaseUrl, secretKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});

let hmacKeyPromise: Promise<CryptoKey> | null = null;

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function isEmail(value: string) {
  return emailPattern.test(value);
}

function isUsername(value: string) {
  return usernamePattern.test(value);
}

function getEmailDomain(email: string) {
  const separatorIndex = email.lastIndexOf("@");

  if (separatorIndex < 0) {
    return "";
  }

  return normalize(email.slice(separatorIndex + 1));
}

function maskedIdentifier(value: string) {
  if (isEmail(value)) {
    const [name, domain] = value.split("@");
    return `${name.slice(0, 2)}***@${domain}`;
  }

  return `${value.slice(0, 2)}***`;
}

function loginSuccessReply() {
  return json({
    ok: true,
    message: "6 haneli giriş kodu e-posta adresine gönderildi.",
  });
}

function loginNotFoundReply() {
  return json(
    {
      code: "LOGIN_ACCOUNT_NOT_FOUND",
      message:
        "Bu bilgilerle kayıtlı bir hesap yok. Bu yüzden giriş e-postası gönderilmedi.",
    },
    404
  );
}

function isRateLimitError(error: { status?: number; message?: string }) {
  const message = String(error.message ?? "").toLowerCase();

  return (
    error.status === 429 ||
    message.includes("rate limit") ||
    message.includes("too many requests") ||
    message.includes("security purposes") ||
    message.includes("email rate limit exceeded") ||
    message.includes("over_email_send_rate_limit")
  );
}

function otpSendErrorReply(
  kind: "login" | "signup",
  error: { status?: number; message?: string }
) {
  if (isRateLimitError(error)) {
    return json(
      {
        code: "OTP_RATE_LIMITED",
        message:
          "Çok fazla kod istedin. Lütfen kısa bir süre bekleyip tekrar dene.",
      },
      429
    );
  }

  return json(
    {
      code: "OTP_SEND_FAILED",
      message:
        kind === "login"
          ? "Giriş kodu şu an gönderilemedi. Lütfen kısa süre sonra tekrar dene."
          : "Kayıt kodu şu an gönderilemedi. Lütfen kısa süre sonra tekrar dene.",
    },
    502
  );
}

function getClientIp(request: Request) {
  const candidates = [
    request.headers.get("cf-connecting-ip"),
    request.headers.get("x-real-ip"),
    request.headers.get("x-forwarded-for")?.split(",")[0],
  ];

  return String(candidates.find(Boolean) ?? "").trim().slice(0, 128);
}

async function getHmacKey() {
  if (!hmacKeyPromise) {
    hmacKeyPromise = crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(signupSecurityHashSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
  }

  return hmacKeyPromise;
}

async function securityHash(kind: "device" | "ip", value: string) {
  const normalizedValue = String(value ?? "").trim();

  if (!normalizedValue) {
    return null;
  }

  const key = await getHmacKey();
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${kind}:${normalizedValue}`)
  );

  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function isFreshDomainCheck(lastCheckedDate: string | null) {
  if (!lastCheckedDate) {
    return false;
  }

  const timestamp = new Date(lastCheckedDate).getTime();

  return (
    Number.isFinite(timestamp) &&
    Date.now() - timestamp <= DOMAIN_CACHE_TTL_MS
  );
}

async function readEmailDomain(domainName: string) {
  const { data, error } = await adminClient
    .from("EmailDomains")
    .select(
      "EmailDomainId, Name, AllowedEmailDomain, SourceCode, LastCheckedDate"
    )
    .eq("Name", domainName)
    .eq("IsActive", true)
    .maybeSingle();

  if (error) {
    console.error(
      JSON.stringify({
        event: "email_domain_lookup_failed",
        domain: domainName,
        message: error.message,
      })
    );
    throw new Error("E-posta alan adı şu an kontrol edilemedi.");
  }

  return (data as EmailDomainRow | null) ?? null;
}

async function checkDisposableEmail(email: string) {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    DISPOSABLE_API_TIMEOUT_MS
  );

  try {
    const url = new URL("https://disposable.debounce.io/");
    url.searchParams.set("email", email);

    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const body = (await response.json()) as { disposable?: unknown };
    const disposable = String(body.disposable ?? "").trim().toLowerCase();

    if (disposable === "true") {
      return true;
    }

    if (disposable === "false") {
      return false;
    }

    throw new Error("Geçersiz API cevabı");
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: "disposable_email_check_unavailable",
        email: maskedIdentifier(email),
        message: error instanceof Error ? error.message : String(error),
      })
    );
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function saveEmailDomainResult(
  domainName: string,
  allowedEmailDomain: boolean
) {
  const now = new Date().toISOString();
  const { data, error } = await adminClient
    .from("EmailDomains")
    .upsert(
      {
        Name: domainName,
        AllowedEmailDomain: allowedEmailDomain,
        SourceCode: "DEBOUNCE",
        LastCheckedDate: now,
        IsActive: true,
        UpdatedDate: now,
      },
      { onConflict: "Name" }
    )
    .select(
      "EmailDomainId, Name, AllowedEmailDomain, SourceCode, LastCheckedDate"
    )
    .single();

  if (error) {
    console.error(
      JSON.stringify({
        event: "email_domain_cache_write_failed",
        domain: domainName,
        message: error.message,
      })
    );
    throw new Error("E-posta alan adı sonucu kaydedilemedi.");
  }

  return data as EmailDomainRow;
}

async function resolveEmailDomainPolicy(email: string) {
  const domainName = getEmailDomain(email);
  const cachedDomain = await readEmailDomain(domainName);

  if (
    cachedDomain &&
    (cachedDomain.SourceCode === "MANUAL" ||
      isFreshDomainCheck(cachedDomain.LastCheckedDate))
  ) {
    return cachedDomain;
  }

  const disposable = await checkDisposableEmail(email);

  // Harici servis cevap vermezse yeni ve bilinmeyen bir domaini yanlışlıkla
  // engellemeyiz. Eski bir cache varsa onun son kararını kullanırız.
  if (disposable === null) {
    return (
      cachedDomain ?? {
        EmailDomainId: 0,
        Name: domainName,
        AllowedEmailDomain: true,
        SourceCode: "DEBOUNCE" as const,
        LastCheckedDate: null,
      }
    );
  }

  return saveEmailDomainResult(domainName, !disposable);
}

async function getActiveSignupBlock(
  deviceHash: string,
  ipHash: string | null
) {
  const { data, error } = await adminClient.rpc("GetSignupSecurityBlock", {
    p_device_hash: deviceHash,
    p_ip_hash: ipHash,
  });

  if (error) {
    console.error(
      JSON.stringify({
        event: "signup_block_lookup_failed",
        message: error.message,
      })
    );
    throw new Error("Kayıt güvenlik kontrolü şu an tamamlanamadı.");
  }

  return ((data?.[0] as SignupBlockRow | undefined) ?? null);
}

async function registerRejectedSignup(
  domainName: string,
  deviceHash: string,
  ipHash: string | null
) {
  const { data, error } = await adminClient.rpc(
    "RegisterRejectedSignupEmail",
    {
      p_domain_name: domainName,
      p_device_hash: deviceHash,
      p_ip_hash: ipHash,
    }
  );

  if (error) {
    console.error(
      JSON.stringify({
        event: "rejected_signup_registration_failed",
        domain: domainName,
        message: error.message,
      })
    );
    throw new Error("Kayıt güvenlik olayı kaydedilemedi.");
  }

  return ((data?.[0] as RejectedSignupRow | undefined) ?? {
    AttemptCount: 1,
    BlockTypeCode: null,
    BlockedUntil: null,
  });
}

function blockedSignupReply(block: SignupBlockRow | RejectedSignupRow) {
  return json(
    {
      code: "SIGNUP_TEMPORARILY_BLOCKED",
      blockedUntil: block.BlockedUntil,
      message:
        "Bu cihazdan veya ağdan art arda kabul edilmeyen e-posta adresleriyle kayıt denemesi yapıldığı için yeni kayıt işlemleri geçici olarak durduruldu. Lütfen daha sonra tekrar dene.",
    },
    429
  );
}

function disallowedEmailReply() {
  return json(
    {
      code: "EMAIL_NOT_ALLOWED",
      message:
        "Geçersiz, geçici veya sorunlu bir e-posta adresi tespit edildi. Giriş sistemi tek kullanımlık kodla çalıştığı için lütfen sürekli erişimin olan bir e-posta adresiyle kaydol.",
    },
    422
  );
}

async function resolveUsernameEmail(username: string) {
  const { data, error } = await adminClient
    .from("Users")
    .select("Email")
    .ilike("Username", username)
    .in("AccountStatus", ["ACTIVE", "FROZEN", "DELETION_PENDING"])
    .limit(1);

  if (error) {
    console.error(
      JSON.stringify({
        event: "username_lookup_failed",
        message: error.message,
      })
    );
    throw new Error("Kullanıcı doğrulaması şu an tamamlanamadı.");
  }

  const email = normalize(data?.[0]?.Email);

  return isEmail(email) ? email : null;
}

async function resolveExistingLoginEmail(identifier: string) {
  if (isUsername(identifier)) {
    return resolveUsernameEmail(identifier);
  }

  if (!isEmail(identifier)) {
    return null;
  }

  const { data, error } = await adminClient
    .from("Users")
    .select("Email")
    .ilike("Email", identifier)
    .in("AccountStatus", ["ACTIVE", "FROZEN", "DELETION_PENDING"])
    .limit(1);

  if (error) {
    console.error(
      JSON.stringify({
        event: "email_lookup_failed",
        message: error.message,
      })
    );
    throw new Error("Kullanıcı doğrulaması şu an tamamlanamadı.");
  }

  const email = normalize(data?.[0]?.Email);

  return isEmail(email) ? email : null;
}

async function resolveLoginEmail(identifier: string) {
  // E-posta ile girişte public.Users kaydına bağlı kalmayız.
  // Böylece eski bir kullanıcıda profil Email alanı boş/kadük olsa bile Auth maili gider.
  if (isEmail(identifier)) {
    return identifier;
  }

  if (!isUsername(identifier)) {
    return null;
  }

  return resolveUsernameEmail(identifier);
}

async function requestLoginOtp(identifier: string) {
  console.log(
    JSON.stringify({
      event: "login_otp_request_started",
      identifier: maskedIdentifier(identifier),
      identifierType: isEmail(identifier) ? "email" : "username",
    })
  );

  const email = await resolveExistingLoginEmail(identifier);

  if (!email) {
    console.log(
      JSON.stringify({
        event: "login_otp_no_matching_profile",
        identifier: maskedIdentifier(identifier),
      })
    );

    return loginNotFoundReply();
  }

  const { error } = await authClient.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
    },
  });

  if (error) {
    console.error(
      JSON.stringify({
        event: "login_otp_auth_send_failed",
        identifier: maskedIdentifier(identifier),
        message: error.message,
        status: error.status ?? null,
      })
    );

    return otpSendErrorReply("login", error);
  }

  console.log(
    JSON.stringify({
      event: "login_otp_auth_send_accepted",
      identifier: maskedIdentifier(identifier),
    })
  );

  return loginSuccessReply();
}

async function requestSignupOtp(payload: Payload, request: Request) {
  const email = normalize(payload.email);
  const username = normalize(payload.username);
  const firstName = String(payload.firstName ?? "").trim();
  const lastName = String(payload.lastName ?? "").trim() || null;
  const birthDate = String(payload.birthDate ?? "").trim();
  const cityId = Number(payload.cityId);
  const deviceToken = String(payload.deviceToken ?? "").trim();
  const accountVisibilityCode =
    payload.accountVisibilityCode === "PRIVATE" ? "PRIVATE" : "PUBLIC";

  if (!isEmail(email)) {
    return json({ message: "Geçerli bir e-posta adresi yazmalısın." }, 400);
  }

  if (!isUsername(username)) {
    return json(
      {
        message:
          "Kullanıcı adı 3-30 karakter olmalı; harf, rakam, nokta ve alt çizgi kullanabilirsin.",
      },
      400
    );
  }

  if (!firstName || !birthDate || !Number.isInteger(cityId) || cityId <= 0) {
    return json({ message: "Kayıt bilgilerini eksiksiz doldurmalısın." }, 400);
  }

  if (!deviceTokenPattern.test(deviceToken)) {
    return json(
      {
        code: "DEVICE_TOKEN_MISSING",
        message:
          "Cihaz güvenlik bilgisi oluşturulamadı. Sayfayı yenileyip tekrar dene.",
      },
      400
    );
  }

  const clientIp = getClientIp(request);
  const deviceHash = await securityHash("device", deviceToken);
  const ipHash = await securityHash("ip", clientIp);

  if (!deviceHash) {
    return json({ message: "Kayıt güvenlik bilgisi oluşturulamadı." }, 500);
  }

  const activeBlock = await getActiveSignupBlock(deviceHash, ipHash);

  if (activeBlock?.BlockedUntil) {
    return blockedSignupReply(activeBlock);
  }

  const domainName = getEmailDomain(email);
  const domainPolicy = await resolveEmailDomainPolicy(email);

  if (!domainPolicy.AllowedEmailDomain) {
    const rejectedAttempt = await registerRejectedSignup(
      domainName,
      deviceHash,
      ipHash
    );

    console.warn(
      JSON.stringify({
        event: "signup_email_domain_rejected",
        domain: domainName,
        attemptCount: rejectedAttempt.AttemptCount,
        blockType: rejectedAttempt.BlockTypeCode,
      })
    );

    if (rejectedAttempt.BlockedUntil) {
      return blockedSignupReply(rejectedAttempt);
    }

    return disallowedEmailReply();
  }

  console.log(
    JSON.stringify({
      event: "signup_otp_request_started",
      email: maskedIdentifier(email),
      username,
      emailDomainSource: domainPolicy.SourceCode,
    })
  );

  const { data: usernameMatches, error: usernameError } = await adminClient
    .from("Users")
    .select("UserId")
    .ilike("Username", username)
    .limit(1);

  if (usernameError) {
    console.error(
      JSON.stringify({
        event: "signup_username_check_failed",
        message: usernameError.message,
      })
    );
    return json({ message: "Kayıt şu an tamamlanamadı." }, 500);
  }

  if ((usernameMatches?.length ?? 0) > 0) {
    return json(
      {
        code: "SIGNUP_USERNAME_TAKEN",
        message: "Bu kullanıcı adı alınmış.",
      },
      409
    );
  }

  const { data: emailMatches, error: emailError } = await adminClient
    .from("Users")
    .select("UserId")
    .ilike("Email", email)
    .limit(1);

  if (emailError) {
    console.error(
      JSON.stringify({
        event: "signup_email_check_failed",
        message: emailError.message,
      })
    );
    return json({ message: "Kayıt şu an tamamlanamadı." }, 500);
  }

  if ((emailMatches?.length ?? 0) > 0) {
    return json(
      {
        code: "SIGNUP_EMAIL_EXISTS",
        message: "Bu e-posta ile bir hesap zaten var.",
      },
      409
    );
  }

  const { error } = await authClient.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      data: {
        username,
        firstName,
        lastName,
        birthDate,
        cityId,
        accountVisibilityCode,
      },
    },
  });

  if (error) {
    console.error(
      JSON.stringify({
        event: "signup_otp_auth_send_failed",
        email: maskedIdentifier(email),
        message: error.message,
        status: error.status ?? null,
      })
    );

    return otpSendErrorReply("signup", error);
  }

  console.log(
    JSON.stringify({
      event: "signup_otp_auth_send_accepted",
      email: maskedIdentifier(email),
    })
  );

  return json({
    ok: true,
    message: "6 haneli kod e-posta adresine gönderildi.",
  });
}

async function verifyOtp(identifier: string, token: string) {
  if (!OTP_PATTERN.test(token)) {
    return json({ message: "6 haneli kodu yaz." }, 400);
  }

  const email = await resolveLoginEmail(identifier);

  if (!email) {
    return json(
      { message: "Kod geçersiz veya süresi dolmuş. Yeni kod iste." },
      401
    );
  }

  const {
    data: { session },
    error,
  } = await authClient.auth.verifyOtp({
    email,
    token,
    type: "email",
  });

  if (error || !session) {
    console.error(
      JSON.stringify({
        event: "otp_verify_failed",
        identifier: maskedIdentifier(identifier),
        message: error?.message ?? "session_yok",
      })
    );

    return json(
      { message: "Kod geçersiz veya süresi dolmuş. Yeni bir kod iste." },
      401
    );
  }

  return json({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ message: "Yalnızca POST isteği desteklenir." }, 405);
  }

  try {
    const payload = (await request.json()) as Payload;
    const action = String(payload.action ?? "").trim();
    const identifier = normalize(payload.identifier);

    if (action === "login") {
      if (!isEmail(identifier) && !isUsername(identifier)) {
        return json(
          { message: "Geçerli bir e-posta adresi veya kullanıcı adı yaz." },
          400
        );
      }

      return await requestLoginOtp(identifier);
    }

    if (action === "signup") {
      return await requestSignupOtp(payload, request);
    }

    if (action === "verify") {
      if (!identifier) {
        return json(
          { message: "Oturum bilgisi bulunamadı. Kodu yeniden iste." },
          400
        );
      }

      return await verifyOtp(identifier, String(payload.token ?? "").trim());
    }

    return json({ message: "Geçersiz işlem." }, 400);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "unhandled_function_error",
        message: error instanceof Error ? error.message : String(error),
      })
    );

    return json(
      { message: "İşlem şu an tamamlanamadı. Lütfen tekrar dene." },
      500
    );
  }
});
