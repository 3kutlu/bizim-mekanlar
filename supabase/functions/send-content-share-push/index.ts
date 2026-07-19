import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

type ContentShareRow = {
  ContentShareId: number;
  SenderUserId: number;
  RecipientUserId: number;
  ShareTypeCode: "PLACE" | "NOTE" | "COLLECTION" | "PROFILE";
  TargetTitle: string;
  TargetPublicId: string | null;
  TargetUsername: string | null;
  Message: string | null;
  PushSentDate: string | null;
  IsActive: boolean;
};

type PushSubscriptionRow = {
  WebPushSubscriptionId: number;
  Endpoint: string;
  P256dh: string;
  Auth: string;
};

type PushPreferenceRow = {
  ContentShareEnabled: boolean;
};

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

function getStatusCode(error: unknown) {
  if (error && typeof error === "object" && "statusCode" in error) {
    return Number((error as { statusCode?: unknown }).statusCode ?? 0);
  }

  return 0;
}

const supabaseUrl = requireSecret("SUPABASE_URL");
const serviceRoleKey = getDefaultProjectKey(
  "SUPABASE_SECRET_KEYS",
  "SUPABASE_SERVICE_ROLE_KEY"
);
const internalSecret = requireSecret("WEB_PUSH_INTERNAL_SECRET");
const vapidPublicKey = requireSecret("WEB_PUSH_VAPID_PUBLIC_KEY");
const vapidPrivateKey = requireSecret("WEB_PUSH_VAPID_PRIVATE_KEY");
const vapidSubject = requireSecret("WEB_PUSH_VAPID_SUBJECT");

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});

webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

function getShareUrl(share: ContentShareRow) {
  const publicId = encodeURIComponent(String(share.TargetPublicId ?? ""));
  const username = encodeURIComponent(String(share.TargetUsername ?? ""));

  switch (share.ShareTypeCode) {
    case "PLACE":
      return publicId ? `/place/${publicId}` : "/";
    case "NOTE":
      return publicId ? `/note/${publicId}` : "/";
    case "COLLECTION":
      return publicId ? `/collection/${publicId}` : "/profile";
    case "PROFILE":
      return username ? `/user/${username}` : "/";
    default:
      return "/";
  }
}


function getShareTypeLabel(typeCode: ContentShareRow["ShareTypeCode"]) {
  switch (typeCode) {
    case "PLACE":
      return "bir mekan";
    case "NOTE":
      return "bir not";
    case "COLLECTION":
      return "bir koleksiyon";
    case "PROFILE":
      return "bir profil";
    default:
      return "bir içerik";
  }
}

function getShareBody(share: ContentShareRow) {
  const message = String(share.Message ?? "").trim();

  if (message) {
    return message;
  }

  switch (share.ShareTypeCode) {
    case "PLACE":
      return `${share.TargetTitle} mekanını görmek için dokun.`;
    case "NOTE":
      return `${share.TargetTitle} notunu görmek için dokun.`;
    case "COLLECTION":
      return `${share.TargetTitle} koleksiyonunu görmek için dokun.`;
    case "PROFILE":
      return `${share.TargetTitle} profilini görmek için dokun.`;
    default:
      return "Paylaşılan içeriği görmek için dokun.";
  }
}

async function deactivateInvalidSubscription(subscriptionId: number) {
  const { error } = await admin
    .from("WebPushSubscriptions")
    .update({
      IsActive: false,
      UpdatedDate: new Date().toISOString(),
    })
    .eq("WebPushSubscriptionId", subscriptionId);

  if (error) {
    console.error(
      JSON.stringify({
        event: "content_share_subscription_deactivate_failed",
        subscriptionId,
        message: error.message,
      })
    );
  }
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return json({ message: "Yalnızca POST isteği desteklenir." }, 405);
  }

  if (request.headers.get("x-push-secret") !== internalSecret) {
    return json({ message: "Yetkisiz istek." }, 401);
  }

  try {
    const body = await request.json();
    const contentShareId = Number(body?.contentShareId);

    if (!Number.isInteger(contentShareId) || contentShareId <= 0) {
      return json({ message: "Geçerli bir contentShareId gerekli." }, 400);
    }

    const claimedAt = new Date().toISOString();
    const { data: share, error: shareError } = await admin
      .from("ContentShares")
      .update({
        PushSentDate: claimedAt,
        UpdatedDate: claimedAt,
      })
      .eq("ContentShareId", contentShareId)
      .eq("IsActive", true)
      .is("PushSentDate", null)
      .select(
        "ContentShareId, SenderUserId, RecipientUserId, ShareTypeCode, TargetTitle, TargetPublicId, TargetUsername, Message, PushSentDate, IsActive"
      )
      .maybeSingle<ContentShareRow>();

    if (shareError) throw shareError;

    if (!share) {
      return json({ ok: true, sent: 0, skipped: true });
    }

    const [senderResult, recipientResult] = await Promise.all([
      admin
        .from("Users")
        .select("Username")
        .eq("UserId", share.SenderUserId)
        .maybeSingle(),
      admin
        .from("Users")
        .select("IsActive, AccountStatus")
        .eq("UserId", share.RecipientUserId)
        .maybeSingle(),
    ]);

    if (senderResult.error) throw senderResult.error;
    if (recipientResult.error) throw recipientResult.error;

    const sender = senderResult.data;
    const recipient = recipientResult.data;

    if (
      !recipient?.IsActive ||
      String(recipient?.AccountStatus ?? "ACTIVE").toUpperCase() !== "ACTIVE"
    ) {
      return json({ ok: true, sent: 0, skipped: true });
    }

    const { data: preference, error: preferenceError } = await admin
      .from("UserWebPushPreferences")
      .select("ContentShareEnabled")
      .eq("UserId", share.RecipientUserId)
      .maybeSingle<PushPreferenceRow>();

    if (preferenceError) throw preferenceError;

    if (preference?.ContentShareEnabled === false) {
      return json({
        ok: true,
        sent: 0,
        skipped: true,
        preferenceSkipped: true,
      });
    }

    const { data: subscriptions, error: subscriptionsError } = await admin
      .from("WebPushSubscriptions")
      .select("WebPushSubscriptionId, Endpoint, P256dh, Auth")
      .eq("UserId", share.RecipientUserId)
      .eq("IsActive", true)
      .returns<PushSubscriptionRow[]>();

    if (subscriptionsError) throw subscriptionsError;

    const payload = JSON.stringify({
      title: `${String(sender?.Username ?? "Bir kullanıcı")} sana ${getShareTypeLabel(share.ShareTypeCode)} gönderdi.`,
      body: getShareBody(share),
      url: getShareUrl(share),
      tag: `bizim-mekanlar-content-share-${share.ContentShareId}`,
    });

    let sent = 0;
    let deactivated = 0;

    for (const subscription of subscriptions ?? []) {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.Endpoint,
            keys: {
              p256dh: subscription.P256dh,
              auth: subscription.Auth,
            },
          },
          payload,
          {
            TTL: 60 * 60 * 12,
            urgency: "normal",
          }
        );
        sent += 1;
      } catch (error) {
        const statusCode = getStatusCode(error);

        console.error(
          JSON.stringify({
            event: "content_share_push_delivery_failed",
            contentShareId,
            subscriptionId: subscription.WebPushSubscriptionId,
            statusCode: statusCode || null,
            message: error instanceof Error ? error.message : String(error),
          })
        );

        if (statusCode === 404 || statusCode === 410) {
          await deactivateInvalidSubscription(subscription.WebPushSubscriptionId);
          deactivated += 1;
        }
      }
    }

    return json({ ok: true, sent, deactivated, skipped: false });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "content_share_push_unhandled_error",
        message: error instanceof Error ? error.message : String(error),
      })
    );

    return json({ message: "Paylaşım bildirimi gönderilemedi." }, 500);
  }
});
