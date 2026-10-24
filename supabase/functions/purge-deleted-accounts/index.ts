import { createClient } from "npm:@supabase/supabase-js@2";

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
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
const internalSecret = requireSecret("ACCOUNT_PURGE_INTERNAL_SECRET");
const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});

async function listAllFiles(bucket: string, prefix: string) {
  const paths: string[] = [];

  async function walk(currentPrefix: string) {
    let offset = 0;
    const limit = 100;

    while (true) {
      const { data, error } = await admin.storage
        .from(bucket)
        .list(currentPrefix, { limit, offset, sortBy: { column: "name", order: "asc" } });

      if (error) throw error;
      const rows = data ?? [];

      for (const row of rows) {
        const path = currentPrefix ? `${currentPrefix}/${row.name}` : row.name;
        if (row.id) {
          paths.push(path);
        } else {
          await walk(path);
        }
      }

      if (rows.length < limit) break;
      offset += limit;
    }
  }

  await walk(prefix);
  return paths;
}

async function removeUserStorage(authUserId: string) {
  for (const bucket of ["profile-photos", "note-photos"]) {
    const paths = await listAllFiles(bucket, authUserId);

    for (let index = 0; index < paths.length; index += 100) {
      const chunk = paths.slice(index, index + 100);
      if (chunk.length === 0) continue;

      const { error } = await admin.storage.from(bucket).remove(chunk);
      if (error) throw error;
    }
  }
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return json({ message: "Yalnızca POST isteği desteklenir." }, 405);
  }

  if (request.headers.get("x-internal-secret") !== internalSecret) {
    return json({ message: "Yetkisiz istek." }, 401);
  }

  try {
    const now = new Date().toISOString();
    const { data: dueUsers, error } = await admin
      .from("Users")
      .select("UserId, AuthUserId, DeletionAuthUserId, Username")
      .eq("AccountStatus", "DELETION_PENDING")
      .lte("ScheduledDeletionDate", now)
      .limit(50);

    if (error) throw error;

    const results: Array<Record<string, unknown>> = [];

    for (const user of dueUsers ?? []) {
      const userId = Number(user.UserId);
      const authUserId = String(
        user.DeletionAuthUserId ?? user.AuthUserId ?? ""
      ).trim();

      try {
        if (!userId || !authUserId) {
          throw new Error("Kullanıcı kimliği eksik.");
        }

        await removeUserStorage(authUserId);

        const { error: purgeError } = await admin.rpc("PurgeUserAccountData", {
          p_user_id: userId,
        });
        if (purgeError) throw purgeError;

        const { error: authDeleteError } = await admin.auth.admin.deleteUser(
          authUserId,
          false
        );
        if (
          authDeleteError &&
          !String(authDeleteError.message ?? "")
            .toLowerCase()
            .includes("user not found")
        ) {
          throw authDeleteError;
        }

        const { error: completeError } = await admin.rpc(
          "CompleteUserAccountDeletion",
          { p_user_id: userId }
        );
        if (completeError) throw completeError;

        results.push({ userId, status: "deleted" });
      } catch (userError) {
        console.error(
          JSON.stringify({
            event: "account_purge_user_failed",
            userId,
            message:
              userError instanceof Error ? userError.message : String(userError),
          })
        );
        results.push({
          userId,
          status: "failed",
          message: userError instanceof Error ? userError.message : String(userError),
        });
      }
    }

    return json({ ok: true, processed: results.length, results });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "account_purge_failed",
        message: error instanceof Error ? error.message : String(error),
      })
    );
    return json({ message: "Hesap temizliği tamamlanamadı." }, 500);
  }
});
