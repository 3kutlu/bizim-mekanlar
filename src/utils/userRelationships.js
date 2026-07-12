import { supabase } from "../supabase.js";

const MUTED_NOTIFICATION_TYPES = new Set([
  "FOLLOWING_NOTE",
  "NOTE_REACTION_UP",
  "NOTE_REACTION_DOWN",
]);

function normalizeUserId(value) {
  const userId = Number(value);
  return Number.isInteger(userId) && userId > 0 ? userId : null;
}

export async function getMyUnavailableUserIds() {
  const { data, error } = await supabase.rpc("GetMyUnavailableUserIds");

  if (error) {
    throw error;
  }

  return new Set(
    (Array.isArray(data) ? data : [])
      .map((row) => normalizeUserId(row?.UserId ?? row))
      .filter(Boolean)
  );
}

export async function getMyMutedUserIds() {
  const { data, error } = await supabase.rpc("GetMyMutedUserIds");

  if (error) {
    throw error;
  }

  return new Set(
    (Array.isArray(data) ? data : [])
      .map((row) => normalizeUserId(row?.UserId ?? row))
      .filter(Boolean)
  );
}

export function filterUnavailableUsers(rows, unavailableUserIds, selectors = []) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const safeSelectors = Array.isArray(selectors) ? selectors : [selectors];

  if (!(unavailableUserIds instanceof Set) || unavailableUserIds.size === 0) {
    return safeRows;
  }

  return safeRows.filter((row) => {
    const candidateIds = safeSelectors
      .map((selector) => {
        if (typeof selector === "function") {
          return selector(row);
        }

        return row?.[selector];
      })
      .map(normalizeUserId)
      .filter(Boolean);

    return !candidateIds.some((userId) => unavailableUserIds.has(userId));
  });
}

export function filterMutedNotifications(rows, mutedUserIds) {
  const safeRows = Array.isArray(rows) ? rows : [];

  if (!(mutedUserIds instanceof Set) || mutedUserIds.size === 0) {
    return safeRows;
  }

  return safeRows.filter((row) => {
    const actorUserId = normalizeUserId(row?.ActorUserId);
    const notificationType = String(row?.NotificationTypeCode ?? "")
      .trim()
      .toUpperCase();

    return !(
      actorUserId &&
      mutedUserIds.has(actorUserId) &&
      MUTED_NOTIFICATION_TYPES.has(notificationType)
    );
  });
}

export async function getMyUserRelationshipState(targetUserId) {
  const normalizedTargetUserId = normalizeUserId(targetUserId);

  if (!normalizedTargetUserId) {
    return {
      IsBlockedByMe: false,
      IsBlockedByThem: false,
      IsMutedByMe: false,
    };
  }

  const { data, error } = await supabase.rpc("GetMyUserRelationshipState", {
    p_target_user_id: normalizedTargetUserId,
  });

  if (error) {
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : data;

  return {
    IsBlockedByMe: Boolean(row?.IsBlockedByMe),
    IsBlockedByThem: Boolean(row?.IsBlockedByThem),
    IsMutedByMe: Boolean(row?.IsMutedByMe),
  };
}
