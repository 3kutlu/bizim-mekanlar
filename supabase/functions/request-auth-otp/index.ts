import { createClient } from "npm:@supabase/supabase-js@2";

type Payload = Record<string, unknown>;

const usernamePattern = /^[a-z0-9._]{3,30}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_LENGTH = 6;
const OTP_PATTERN = new RegExp(`^\\d{${OTP_LENGTH}}$`);

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

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function isEmail(value: string) {
  return emailPattern.test(value);
}

function isUsername(value: string) {
  return usernamePattern.test(value);
}

function maskedIdentifier(value: string) {
  if (isEmail(value)) {
    const [name, domain] = value.split("@");
    return `${name.slice(0, 2)}***@${domain}`;
  }

  return `${value.slice(0, 2)}***`;
}

function genericLoginReply() {
  return json({
    ok: true,
    message:
      "Eşleşen hesabın varsa 6 haneli giriş kodu e-posta adresine gönderildi.",
  });
}

async function resolveUsernameEmail(username: string) {
  const { data, error } = await adminClient
    .from("Users")
    .select("Email")
    .ilike("Username", username)
    .neq("AccountStatus", "DELETED")
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

  const email = await resolveLoginEmail(identifier);

  if (!email) {
    console.log(
      JSON.stringify({
        event: "login_otp_no_matching_profile",
        identifier: maskedIdentifier(identifier),
      })
    );

    // Kullanıcı hesabının varlığını dışarıya açma.
    return genericLoginReply();
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

    // Önce bu hata görünür olsun. Eski sürüm burada 200 dönüp UI'ı yanlışlıkla
    // "kod gönderildi" ekranına geçiriyordu.
    return json(
      {
        message:
          "Giriş kodu gönderilemedi. Supabase → Edge Functions → request-auth-otp → Logs ekranındaki son satırı kontrol et.",
      },
      502
    );
  }

  console.log(
    JSON.stringify({
      event: "login_otp_auth_send_accepted",
      identifier: maskedIdentifier(identifier),
    })
  );

  return genericLoginReply();
}

async function requestSignupOtp(payload: Payload) {
  const email = normalize(payload.email);
  const username = normalize(payload.username);
  const firstName = String(payload.firstName ?? "").trim();
  const lastName = String(payload.lastName ?? "").trim() || null;
  const birthDate = String(payload.birthDate ?? "").trim();
  const cityId = Number(payload.cityId);
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

  console.log(
    JSON.stringify({
      event: "signup_otp_request_started",
      email: maskedIdentifier(email),
      username,
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
    return json({ message: "Bu kullanıcı adı alınmış." }, 409);
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
    return json({ message: "Bu e-posta ile bir hesap zaten var." }, 409);
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

    return json(
      {
        message:
          "Kayıt kodu gönderilemedi. Supabase → Edge Functions → request-auth-otp → Logs ekranındaki son satırı kontrol et.",
      },
      502
    );
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
      { message: "Kod geçersiz veya süresi dolmuş. Yeni kod iste." },
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
      return await requestSignupOtp(payload);
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
