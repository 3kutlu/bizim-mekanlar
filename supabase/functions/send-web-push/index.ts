import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

type NotificationRow = {
  NotificationId: number;
  RecipientUserId: number;
  ActorUserId: number;
  NotificationTypeCode: string;
  PlaceNoteId: number | null;
  UserPlaceListId: number | null;
  IsActive: boolean;
};

type PushSubscriptionRow = {
  WebPushSubscriptionId: number;
  Endpoint: string;
  P256dh: string;
  Auth: string;
};

type PushPreferenceRow = {
  FollowRequestEnabled: boolean;
  FollowedEnabled: boolean;
  FollowingNoteEnabled: boolean;
  NoteReactionEnabled: boolean;
  CollectionCollaboratorEnabled: boolean;
};

function isNotificationTypeEnabled(
  notificationTypeCode: string,
  preferences: PushPreferenceRow | null
) {
  switch (notificationTypeCode) {
    case "FOLLOW_REQUEST":
      return preferences?.FollowRequestEnabled !== false;
    case "FOLLOWED":
      return preferences?.FollowedEnabled !== false;
    case "FOLLOWING_NOTE":
      return preferences?.FollowingNoteEnabled !== false;
    case "NOTE_REACTION_UP":
    case "NOTE_REACTION_DOWN":
      return preferences?.NoteReactionEnabled !== false;
    case "COLLECTION_COLLABORATOR_ADDED":
      return preferences?.CollectionCollaboratorEnabled !== false;
    default:
      return true;
  }
}

function canBeMutedByUser(notificationTypeCode: string) {
  return [
    "FOLLOWING_NOTE",
    "NOTE_REACTION_UP",
    "NOTE_REACTION_DOWN",
  ].includes(notificationTypeCode);
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
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
      // Fall back to legacy key names.
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

function requireSecret(name: string) {
  const value = Deno.env.get(name)?.trim();

  if (!value) {
    throw new Error(`${name} bulunamadı.`);
  }

  return value;
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

function getStatusCode(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "statusCode" in error
  ) {
    return Number((error as { statusCode?: unknown }).statusCode ?? 0);
  }

  return 0;
}

function getNotificationCopy(
  notification: NotificationRow,
  actorUsername: string,
  placeName: string | null,
  notePublicId: string | null,
  collectionName: string | null,
  collectionPublicId: string | null
) {
  const actor = actorUsername || "Bir kullanıcı";

  switch (notification.NotificationTypeCode) {
    case "FOLLOW_REQUEST":
      return {
        title: `${actor} sana takip isteği gönderdi.`,
        body: "İsteği görmek için dokun.",
        url: `/user/${encodeURIComponent(actor)}`,
      };
    case "FOLLOWED":
      return {
        title: `${actor} seni takip etmeye başladı.`,
        body: "Profili görmek için dokun.",
        url: `/user/${encodeURIComponent(actor)}`,
      };
    case "FOLLOWING_NOTE":
      return {
        title: `${actor} yeni bir not ekledi.`,
        body: placeName
          ? `${placeName} için yeni bir not bıraktı.`
          : "Yeni notu görmek için dokun.",
        url: notePublicId ? `/note/${notePublicId}` : `/user/${encodeURIComponent(actor)}`,
      };
    case "NOTE_REACTION_UP":
      return {
        title: `${actor} notunu beğendi.`,
        body: placeName
          ? `${placeName} için yazdığın notu beğendi.`
          : "Notunu görmek için dokun.",
        url: notePublicId ? `/note/${notePublicId}` : `/user/${encodeURIComponent(actor)}`,
      };
    case "COLLECTION_COLLABORATOR_ADDED":
      return {
        title: `${actor} seni bir listeye ekledi.`,
        body: collectionName
          ? `${collectionName} listesine artık birlikte mekan ekleyebilirsiniz.`
          : "Ortak koleksiyonu görmek için dokun.",
        url: collectionPublicId ? `/collection/${collectionPublicId}` : "/profile",
      };
    case "NOTE_REACTION_DOWN":
      return {
        title: `${actor} notunu beğenmedi.`,
        body: placeName
          ? `${placeName} için yazdığın nota olumsuz tepki verdi.`
          : "Notunu görmek için dokun.",
        url: notePublicId ? `/note/${notePublicId}` : `/user/${encodeURIComponent(actor)}`,
      };
    default:
      return {
        title: "Bizim Mekanlar",
        body: "Yeni bir gelişmen var.",
        url: "/",
      };
  }
}

async function getNotificationContext(notificationId: number) {
  const { data: notification, error: notificationError } = await admin
    .from("Notifications")
    .select(
      "NotificationId, RecipientUserId, ActorUserId, NotificationTypeCode, PlaceNoteId, UserPlaceListId, IsActive"
    )
    .eq("NotificationId", notificationId)
    .maybeSingle<NotificationRow>();

  if (notificationError) {
    throw notificationError;
  }

  if (!notification?.IsActive) {
    return null;
  }

  const [{ data: actor, error: actorError }, noteContext] = await Promise.all([
    admin
      .from("Users")
      .select("Username")
      .eq("UserId", notification.ActorUserId)
      .maybeSingle(),
    notification.PlaceNoteId
      ? admin
          .from("PlaceNotes")
          .select("PublicId, PlaceId")
          .eq("PlaceNoteId", notification.PlaceNoteId)
          .eq("IsActive", true)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (actorError) {
    throw actorError;
  }

  if (noteContext.error) {
    throw noteContext.error;
  }

  let placeName: string | null = null;

  if (noteContext.data?.PlaceId) {
    const { data: place, error: placeError } = await admin
      .from("Places")
      .select("Name")
      .eq("PlaceId", noteContext.data.PlaceId)
      .maybeSingle();

    if (placeError) {
      throw placeError;
    }

    placeName = String(place?.Name ?? "").trim() || null;
  }

  let collectionName: string | null = null;
  let collectionPublicId: string | null = null;

  if (notification.UserPlaceListId) {
    const { data: collection, error: collectionError } = await admin
      .from("UserPlaceLists")
      .select("Name, PublicId")
      .eq("UserPlaceListId", notification.UserPlaceListId)
      .eq("IsActive", true)
      .maybeSingle();

    if (collectionError) {
      throw collectionError;
    }

    collectionName = String(collection?.Name ?? "").trim() || null;
    collectionPublicId = collection?.PublicId ? String(collection.PublicId) : null;
  }

  return {
    notification,
    actorUsername: String(actor?.Username ?? "").trim(),
    placeName,
    notePublicId: noteContext.data?.PublicId
      ? String(noteContext.data.PublicId)
      : null,
    collectionName,
    collectionPublicId,
  };
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
        event: "web_push_subscription_deactivate_failed",
        subscriptionId,
        message: error.message,
      })
    );
  }
}

async function sendNotification(notificationId: number) {
  const context = await getNotificationContext(notificationId);

  if (!context) {
    return { sent: 0, deactivated: 0, skipped: true };
  }

  const { notification, actorUsername, placeName, notePublicId, collectionName, collectionPublicId } = context;
  const { data: preferences, error: preferencesError } = await admin
    .from("UserWebPushPreferences")
    .select(
      "FollowRequestEnabled, FollowedEnabled, FollowingNoteEnabled, NoteReactionEnabled, CollectionCollaboratorEnabled"
    )
    .eq("UserId", notification.RecipientUserId)
    .maybeSingle<PushPreferenceRow>();

  if (preferencesError) {
    throw preferencesError;
  }

  if (!isNotificationTypeEnabled(notification.NotificationTypeCode, preferences)) {
    return { sent: 0, deactivated: 0, skipped: true, preferenceSkipped: true };
  }

  if (canBeMutedByUser(notification.NotificationTypeCode)) {
    const { data: mute, error: muteError } = await admin
      .from("UserMutes")
      .select("UserMuteId")
      .eq("MuterUserId", notification.RecipientUserId)
      .eq("MutedUserId", notification.ActorUserId)
      .eq("IsActive", true)
      .maybeSingle();

    if (muteError) {
      throw muteError;
    }

    if (mute) {
      return { sent: 0, deactivated: 0, skipped: true, userMuteSkipped: true };
    }
  }

  const { data: subscriptions, error: subscriptionsError } = await admin
    .from("WebPushSubscriptions")
    .select("WebPushSubscriptionId, Endpoint, P256dh, Auth")
    .eq("UserId", notification.RecipientUserId)
    .eq("IsActive", true)
    .returns<PushSubscriptionRow[]>();

  if (subscriptionsError) {
    throw subscriptionsError;
  }

  const copy = getNotificationCopy(
    notification,
    actorUsername,
    placeName,
    notePublicId,
    collectionName,
    collectionPublicId
  );
  const payload = JSON.stringify({
    ...copy,
    tag: `bizim-mekanlar-${notification.NotificationId}`,
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
          event: "web_push_delivery_failed",
          notificationId,
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

  return { sent, deactivated, skipped: false };
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
    const notificationId = Number(body?.notificationId);

    if (!Number.isInteger(notificationId) || notificationId <= 0) {
      return json({ message: "Geçerli bir notificationId gerekli." }, 400);
    }

    const result = await sendNotification(notificationId);
    return json({ ok: true, ...result });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "web_push_unhandled_error",
        message: error instanceof Error ? error.message : String(error),
      })
    );

    return json({ message: "Push bildirimi gönderilemedi." }, 500);
  }
});
