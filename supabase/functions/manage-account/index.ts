import { createClient } from "npm:@supabase/supabase-js@2";

type Payload = Record<string, unknown>;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function requireSecret(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} bulunamadı.`);
  return value;
}

function getDefaultProjectKey(groupedName: string, legacyName: string) {
  const grouped = Deno.env.get(groupedName);
  if (grouped) {
    try {
      const parsed = JSON.parse(grouped) as Record<string, unknown>;
      const value = typeof parsed.default === "string"
        ? parsed.default
        : Object.values(parsed).find((item) => typeof item === "string");
      if (typeof value === "string" && value) return value;
    } catch {
      // Fall back to legacy key.
    }
  }
  return requireSecret(legacyName);
}

const supabaseUrl = requireSecret("SUPABASE_URL");
const serviceRoleKey = getDefaultProjectKey(
  "SUPABASE_SECRET_KEYS",
  "SUPABASE_SERVICE_ROLE_KEY"
);

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});

async function getAuthenticatedUser(request: Request) {
  const authorization = request.headers.get("Authorization") ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();

  if (!token) return null;

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ message: "Yalnızca POST isteği desteklenir." }, 405);
  }

  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) {
      return json({ message: "Oturum doğrulanamadı." }, 401);
    }

    const payload = (await request.json()) as Payload;
    const action = String(payload.action ?? "").trim().toLowerCase();
    const { data: profile, error: profileError } = await admin
      .from("Users")
      .select(
        "UserId, Username, AccountStatus, IsActive, ScheduledDeletionDate"
      )
      .eq("AuthUserId", authUser.id)
      .maybeSingle();

    if (profileError) throw profileError;
    if (!profile) return json({ message: "Kullanıcı profili bulunamadı." }, 404);

    const now = new Date();

    if (action === "freeze") {
      const { error } = await admin
        .from("Users")
        .update({
          AccountStatus: "FROZEN",
          IsActive: false,
          FrozenDate: now.toISOString(),
          DeletionRequestedDate: null,
          ScheduledDeletionDate: null,
          DeletionAuthUserId: null,
          UpdatedDate: now.toISOString(),
        })
        .eq("UserId", profile.UserId);

      if (error) throw error;

      await admin
        .from("WebPushSubscriptions")
        .update({ IsActive: false, UpdatedDate: now.toISOString() })
        .eq("UserId", profile.UserId);

      return json({ ok: true, account_status: "FROZEN" });
    }

    if (action === "request-deletion") {
      const enteredUsername = String(payload.username ?? "")
        .trim()
        .toLowerCase();
      const actualUsername = String(profile.Username ?? "")
        .trim()
        .toLowerCase();

      if (!enteredUsername || enteredUsername !== actualUsername) {
        return json({ message: "Kullanıcı adı eşleşmiyor." }, 400);
      }

      const scheduledDeletionDate = new Date(
        now.getTime() + 7 * 24 * 60 * 60 * 1000
      );
      const { error } = await admin
        .from("Users")
        .update({
          AccountStatus: "DELETION_PENDING",
          IsActive: false,
          FrozenDate: now.toISOString(),
          DeletionRequestedDate: now.toISOString(),
          ScheduledDeletionDate: scheduledDeletionDate.toISOString(),
          DeletionAuthUserId: authUser.id,
          UpdatedDate: now.toISOString(),
        })
        .eq("UserId", profile.UserId);

      if (error) throw error;

      await admin
        .from("WebPushSubscriptions")
        .update({ IsActive: false, UpdatedDate: now.toISOString() })
        .eq("UserId", profile.UserId);

      return json({
        ok: true,
        account_status: "DELETION_PENDING",
        scheduled_deletion_date: scheduledDeletionDate.toISOString(),
      });
    }

    if (action === "reactivate") {
      if (!["FROZEN", "DELETION_PENDING"].includes(profile.AccountStatus)) {
        return json({ message: "Hesap zaten aktif." }, 409);
      }

      if (
        profile.AccountStatus === "DELETION_PENDING" &&
        profile.ScheduledDeletionDate &&
        new Date(profile.ScheduledDeletionDate).getTime() <= now.getTime()
      ) {
        return json(
          { message: "Hesabın geri açılma süresi dolmuş." },
          410
        );
      }

      const { error } = await admin
        .from("Users")
        .update({
          AccountStatus: "ACTIVE",
          IsActive: true,
          FrozenDate: null,
          DeletionRequestedDate: null,
          ScheduledDeletionDate: null,
          DeletionAuthUserId: null,
          UpdatedDate: now.toISOString(),
        })
        .eq("UserId", profile.UserId);

      if (error) throw error;

      return json({ ok: true, account_status: "ACTIVE" });
    }

    return json({ message: "Geçersiz hesap işlemi." }, 400);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "manage_account_failed",
        message: error instanceof Error ? error.message : String(error),
      })
    );
    return json(
      { message: "Hesap işlemi şu an tamamlanamadı. Tekrar dene." },
      500
    );
  }
});
