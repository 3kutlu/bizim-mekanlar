export const APP_HISTORY_STATE_KEY = "__bizimMekanlarNavigation";
export const APP_HISTORY_VERSION = 1;

const USERNAME_PATTERN = /^[a-z0-9._]{3,30}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROFILE_COLLECTION_TYPES = new Set(["notes", "followers", "following"]);

export const ROUTE_PATHS = Object.freeze({
  MAP: "/",
  FEED: "/feed",
  PROFILE: "/profile",
  SEARCH: "/search",
  SETTINGS: "/settings",
});

function decodeSegment(segment) {
  try {
    return decodeURIComponent(String(segment ?? ""));
  } catch {
    return "";
  }
}

function encodeSegment(value) {
  return encodeURIComponent(String(value ?? "").trim());
}

function getPathname(value) {
  const rawValue = String(value ?? "").trim() || ROUTE_PATHS.MAP;
  const [pathname = ROUTE_PATHS.MAP] = rawValue.split("?", 1);
  const normalizedPathname = pathname.replace(/\/+$/, "") || ROUTE_PATHS.MAP;

  return normalizedPathname.startsWith("/")
    ? normalizedPathname
    : `/${normalizedPathname}`;
}

export function normalizeUsername(value) {
  const username = String(value ?? "").trim().toLowerCase();
  return USERNAME_PATTERN.test(username) ? username : "";
}

export function isPublicId(value) {
  return UUID_PATTERN.test(String(value ?? "").trim());
}

// Profile links are intentionally readable and username-only. This matches the
// product decision that a renamed username is no longer reserved for old links.
export function buildUserPath(username) {
  const normalizedUsername = normalizeUsername(username);
  return normalizedUsername ? `/user/${encodeSegment(normalizedUsername)}` : "";
}

export function buildProfileCollectionPath(username, type) {
  const normalizedUsername = normalizeUsername(username);
  const normalizedType = String(type ?? "").trim().toLowerCase();

  if (!normalizedUsername || !PROFILE_COLLECTION_TYPES.has(normalizedType)) {
    return "";
  }

  return `/user/${encodeSegment(normalizedUsername)}/${normalizedType}`;
}

export function buildPlacePath(publicId) {
  const normalizedPublicId = String(publicId ?? "").trim().toLowerCase();
  return isPublicId(normalizedPublicId)
    ? `/place/${encodeSegment(normalizedPublicId)}`
    : "";
}

export function buildNotePath(publicId) {
  const normalizedPublicId = String(publicId ?? "").trim().toLowerCase();
  return isPublicId(normalizedPublicId)
    ? `/note/${encodeSegment(normalizedPublicId)}`
    : "";
}

export function buildCollectionPath(publicId) {
  const normalizedPublicId = String(publicId ?? "").trim().toLowerCase();
  return isPublicId(normalizedPublicId)
    ? `/collection/${encodeSegment(normalizedPublicId)}`
    : "";
}

// Query strings are deliberately ignored for routed screens. This also
// canonicalizes older /user/:username?profile=<uuid> links to /user/:username.
export function normalizeRoutePath(value) {
  return getPathname(value);
}

export function getLocationRoutePath() {
  if (typeof window === "undefined") {
    return ROUTE_PATHS.MAP;
  }

  return normalizeRoutePath(window.location.pathname);
}

export function parseRoutePath(value) {
  const pathname = normalizeRoutePath(value);
  const segments = pathname
    .split("/")
    .filter(Boolean)
    .map(decodeSegment);

  if (segments.length === 0 || (segments.length === 1 && segments[0] === "map")) {
    return { kind: "map", path: ROUTE_PATHS.MAP };
  }

  if (segments.length === 1 && segments[0] === "feed") {
    return { kind: "feed", path: ROUTE_PATHS.FEED };
  }

  if (segments.length === 1 && segments[0] === "profile") {
    return { kind: "profile", path: ROUTE_PATHS.PROFILE };
  }

  if (segments.length === 1 && segments[0] === "search") {
    return { kind: "search", path: ROUTE_PATHS.SEARCH };
  }

  if (segments.length === 1 && segments[0] === "settings") {
    return { kind: "settings", path: ROUTE_PATHS.SETTINGS };
  }

  if (segments[0] === "user" && segments.length === 2) {
    const username = normalizeUsername(segments[1]);
    return username
      ? {
          kind: "user",
          username,
          path: buildUserPath(username),
        }
      : { kind: "not-found", path: pathname };
  }

  if (segments[0] === "user" && segments.length === 3) {
    const username = normalizeUsername(segments[1]);
    const collectionType = String(segments[2] ?? "").trim().toLowerCase();

    return username && PROFILE_COLLECTION_TYPES.has(collectionType)
      ? {
          kind: "profile-collection",
          username,
          collectionType,
          path: buildProfileCollectionPath(username, collectionType),
        }
      : { kind: "not-found", path: pathname };
  }

  if (segments.length === 2 && segments[0] === "place" && isPublicId(segments[1])) {
    const publicId = String(segments[1]).toLowerCase();
    return { kind: "place", publicId, path: buildPlacePath(publicId) };
  }

  if (segments.length === 2 && segments[0] === "note" && isPublicId(segments[1])) {
    const publicId = String(segments[1]).toLowerCase();
    return { kind: "note", publicId, path: buildNotePath(publicId) };
  }

  if (
    segments.length === 2 &&
    segments[0] === "collection" &&
    isPublicId(segments[1])
  ) {
    const publicId = String(segments[1]).toLowerCase();
    return { kind: "collection", publicId, path: buildCollectionPath(publicId) };
  }

  return { kind: "not-found", path: pathname };
}

export function createNavigationSnapshot({
  activePage = "map",
  discoveryStack = [],
  mapTarget = null,
  placeReviewFilter = null,
  path = ROUTE_PATHS.MAP,
} = {}) {
  const normalizedActivePage = ["map", "list", "profile"].includes(activePage)
    ? activePage
    : "map";

  return {
    activePage: normalizedActivePage,
    discoveryStack: Array.isArray(discoveryStack) ? discoveryStack : [],
    mapTarget: mapTarget ?? null,
    placeReviewFilter: placeReviewFilter ?? null,
    path: normalizeRoutePath(path),
  };
}

export function toHistoryState(snapshot) {
  return {
    [APP_HISTORY_STATE_KEY]: true,
    version: APP_HISTORY_VERSION,
    navigation: createNavigationSnapshot(snapshot),
  };
}

export function fromHistoryState(state) {
  if (
    !state ||
    state[APP_HISTORY_STATE_KEY] !== true ||
    Number(state.version) !== APP_HISTORY_VERSION ||
    !state.navigation
  ) {
    return null;
  }

  return createNavigationSnapshot(state.navigation);
}
