import { supabase } from "../supabase.js";

const LAST_SEEN_TOUCH_KEY_PREFIX = "bizim-mekanlar:last-seen-touch";
const FIFTEEN_MINUTES = 15 * 60 * 1000;

function getLastSeenTouchKey(userId) {
  return `${LAST_SEEN_TOUCH_KEY_PREFIX}:${Number(userId) || "unknown"}`;
}

export async function touchLastSeenIfNeeded(userId) {
  try {
    if (typeof window === "undefined" || !userId) {
      return;
    }

    const storageKey = getLastSeenTouchKey(userId);
    const now = Date.now();
    const lastTouch = Number(window.localStorage.getItem(storageKey) || 0);

    if (now - lastTouch < FIFTEEN_MINUTES) {
      return;
    }

    const { error } = await supabase.rpc("TouchMyLastSeen");

    if (error) {
      console.warn("LastSeenDate güncellenemedi:", error.message);
      return;
    }

    window.localStorage.setItem(storageKey, String(now));
  } catch (error) {
    console.warn("LastSeenDate güncellenemedi:", error);
  }
}
