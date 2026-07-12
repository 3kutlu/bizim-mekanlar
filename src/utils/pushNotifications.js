import { supabase } from "../supabase.js";

const SERVICE_WORKER_PATH = "/sw.js";
const VAPID_PUBLIC_KEY = String(
  import.meta.env.VITE_VAPID_PUBLIC_KEY ?? ""
).trim();

export const DEFAULT_PUSH_NOTIFICATION_PREFERENCES = Object.freeze({
  followRequestEnabled: true,
  followedEnabled: true,
  followingNoteEnabled: true,
  noteReactionEnabled: true,
  collectionCollaboratorEnabled: true,
  contentShareEnabled: true,
});

function normalizePushNotificationPreferences(value) {
  return {
    followRequestEnabled:
      value?.FollowRequestEnabled ??
      value?.followRequestEnabled ??
      DEFAULT_PUSH_NOTIFICATION_PREFERENCES.followRequestEnabled,
    followedEnabled:
      value?.FollowedEnabled ??
      value?.followedEnabled ??
      DEFAULT_PUSH_NOTIFICATION_PREFERENCES.followedEnabled,
    followingNoteEnabled:
      value?.FollowingNoteEnabled ??
      value?.followingNoteEnabled ??
      DEFAULT_PUSH_NOTIFICATION_PREFERENCES.followingNoteEnabled,
    noteReactionEnabled:
      value?.NoteReactionEnabled ??
      value?.noteReactionEnabled ??
      DEFAULT_PUSH_NOTIFICATION_PREFERENCES.noteReactionEnabled,
    collectionCollaboratorEnabled:
      value?.CollectionCollaboratorEnabled ??
      value?.collectionCollaboratorEnabled ??
      DEFAULT_PUSH_NOTIFICATION_PREFERENCES.collectionCollaboratorEnabled,
    contentShareEnabled:
      value?.ContentShareEnabled ??
      value?.contentShareEnabled ??
      DEFAULT_PUSH_NOTIFICATION_PREFERENCES.contentShareEnabled,
  };
}

function isBrowser() {
  return typeof window !== "undefined" && typeof navigator !== "undefined";
}

function isIOSDevice() {
  if (!isBrowser()) {
    return false;
  }

  const userAgent = navigator.userAgent || "";
  const iPadOnMac =
    navigator.platform === "MacIntel" && Number(navigator.maxTouchPoints) > 1;

  return /iPad|iPhone|iPod/i.test(userAgent) || iPadOnMac;
}

function isStandaloneDisplayMode() {
  if (!isBrowser()) {
    return false;
  }

  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    window.navigator.standalone === true
  );
}

function hasBrowserPushApis() {
  return Boolean(
    isBrowser() &&
      window.isSecureContext &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window
  );
}

function urlBase64ToUint8Array(value) {
  const normalized = String(value ?? "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "="
  );
  const decoded = window.atob(padded);

  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

function arrayBufferToBase64Url(value) {
  if (!value) {
    return "";
  }

  const bytes = new Uint8Array(value);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return window
    .btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function getEnvironmentStatus() {
  if (!isBrowser()) {
    return { state: "unsupported" };
  }

  if (isIOSDevice() && !isStandaloneDisplayMode()) {
    return { state: "needs-home-screen" };
  }

  if (!hasBrowserPushApis()) {
    return { state: "unsupported" };
  }

  if (!VAPID_PUBLIC_KEY) {
    return { state: "not-configured" };
  }

  if (Notification.permission === "denied") {
    return { state: "blocked" };
  }

  return { state: "ready" };
}

export async function registerPushServiceWorker() {
  if (!isBrowser() || !("serviceWorker" in navigator)) {
    return null;
  }

  return navigator.serviceWorker.register(SERVICE_WORKER_PATH, {
    scope: "/",
  });
}

async function getPushRegistration() {
  const registration = await registerPushServiceWorker();

  if (!registration) {
    throw new Error("Bu tarayıcı service worker desteği sunmuyor.");
  }

  return navigator.serviceWorker.ready;
}

function subscriptionToPayload(subscription) {
  const subscriptionJson = subscription?.toJSON?.() ?? {};
  const endpoint = String(subscriptionJson.endpoint ?? subscription?.endpoint ?? "").trim();
  const p256dh = String(
    subscriptionJson.keys?.p256dh ??
      arrayBufferToBase64Url(subscription?.getKey?.("p256dh"))
  ).trim();
  const auth = String(
    subscriptionJson.keys?.auth ??
      arrayBufferToBase64Url(subscription?.getKey?.("auth"))
  ).trim();

  if (!endpoint || !p256dh || !auth) {
    throw new Error("Bildirim aboneliği okunamadı.");
  }

  return {
    endpoint,
    p256dh,
    auth,
  };
}

async function persistSubscription(subscription) {
  const payload = subscriptionToPayload(subscription);
  const { error } = await supabase.rpc("UpsertMyWebPushSubscription", {
    p_endpoint: payload.endpoint,
    p_p256dh: payload.p256dh,
    p_auth: payload.auth,
    p_user_agent: navigator.userAgent || null,
  });

  if (error) {
    throw error;
  }

  return payload;
}

async function deactivateSubscription(subscription) {
  if (!subscription) {
    return;
  }

  const { endpoint } = subscriptionToPayload(subscription);
  const { error } = await supabase.rpc("DeactivateMyWebPushSubscription", {
    p_endpoint: endpoint,
  });

  if (error) {
    throw error;
  }
}

export async function getMyPushNotificationPreferences() {
  const [baseResult, contentShareResult] = await Promise.all([
    supabase.rpc("GetMyWebPushNotificationPreferences"),
    supabase.rpc("GetMyContentSharePushPreference"),
  ]);

  if (baseResult.error) {
    throw baseResult.error;
  }

  if (contentShareResult.error) {
    throw contentShareResult.error;
  }

  const baseRow = Array.isArray(baseResult.data)
    ? baseResult.data[0]
    : baseResult.data;
  const contentShareRow = Array.isArray(contentShareResult.data)
    ? contentShareResult.data[0]
    : contentShareResult.data;

  return normalizePushNotificationPreferences({
    ...baseRow,
    ContentShareEnabled: contentShareRow?.ContentShareEnabled,
  });
}

export async function updateMyPushNotificationPreferences(preferences) {
  const normalized = normalizePushNotificationPreferences(preferences);
  const { error: baseError } = await supabase.rpc(
    "UpdateMyWebPushNotificationPreferences",
    {
      p_follow_request_enabled: normalized.followRequestEnabled,
      p_followed_enabled: normalized.followedEnabled,
      p_following_note_enabled: normalized.followingNoteEnabled,
      p_note_reaction_enabled: normalized.noteReactionEnabled,
      p_collection_collaborator_enabled:
        normalized.collectionCollaboratorEnabled,
    }
  );

  if (baseError) {
    throw baseError;
  }

  const { error: contentShareError } = await supabase.rpc(
    "UpdateMyContentSharePushPreference",
    {
      p_content_share_enabled: normalized.contentShareEnabled,
    }
  );

  if (contentShareError) {
    throw contentShareError;
  }

  return normalized;
}

export async function getPushNotificationStatus() {
  const environment = getEnvironmentStatus();

  if (environment.state !== "ready") {
    return environment;
  }

  try {
    const registration = await getPushRegistration();
    const subscription = await registration.pushManager.getSubscription();

    return {
      state: subscription ? "enabled" : "ready",
      subscription,
    };
  } catch (error) {
    console.error("Push bildirim durumu okunamadı:", error);
    return { state: "unavailable" };
  }
}

export async function enablePushNotifications() {
  const status = await getPushNotificationStatus();

  if (!["ready", "enabled"].includes(status.state)) {
    return status;
  }

  let permission = Notification.permission;

  if (permission === "default") {
    permission = await Notification.requestPermission();
  }

  if (permission === "denied") {
    return { state: "blocked" };
  }

  if (permission !== "granted") {
    return { state: "unavailable" };
  }

  const registration = await getPushRegistration();
  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  await persistSubscription(subscription);

  return {
    state: "enabled",
    subscription,
  };
}

export async function syncExistingPushSubscription() {
  const status = await getPushNotificationStatus();

  if (status.state !== "enabled" || !status.subscription) {
    return status;
  }

  await persistSubscription(status.subscription);
  return status;
}

export async function disablePushNotifications() {
  const environment = getEnvironmentStatus();

  if (environment.state !== "ready") {
    return environment;
  }

  const registration = await getPushRegistration();
  const subscription = await registration.pushManager.getSubscription();

  if (subscription) {
    await deactivateSubscription(subscription);
    await subscription.unsubscribe();
  }

  return { state: "ready" };
}

export async function detachCurrentPushSubscription() {
  const environment = getEnvironmentStatus();

  if (environment.state !== "ready") {
    return;
  }

  try {
    const registration = await getPushRegistration();
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      await deactivateSubscription(subscription);
    }
  } catch (error) {
    // A sign-out must not fail just because a push endpoint is unavailable.
    console.warn("Push aboneliği oturumdan ayrılamadı:", error);
  }
}
