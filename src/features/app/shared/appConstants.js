import { MESSAGE_KEY } from "../../../i18n/messages.js";

export const EMPTY_SUMMARY = Object.freeze({
  CityName: "",
  FollowerCount: 0,
  FollowingCount: 0,
  NoteCount: 0,
});

export const SILENT_NOTIFICATION_REFRESH_INTERVAL_MS = 60_000;

export const PROFILE_COLLECTIONS = Object.freeze({
  notes: {
    title: "Notlar",
    emptyMessageKey: MESSAGE_KEY.PROFILE_COLLECTION_NOTES_EMPTY,
  },
  followers: {
    title: "Takipçiler",
    emptyMessageKey: MESSAGE_KEY.PROFILE_COLLECTION_FOLLOWERS_EMPTY,
  },
  following: {
    title: "Takip edilenler",
    emptyMessageKey: MESSAGE_KEY.PROFILE_COLLECTION_FOLLOWING_EMPTY,
  },
});

export const PROFILE_TAB_IDS = Object.freeze({
  NOTES: "notes",
  PHOTOS: "photos",
  SAVED: "saved",
});

export const EMPTY_NOTE_REACTION_SUMMARY = Object.freeze({
  UpCount: 0,
  DownCount: 0,
  MyReactionCode: null,
});

export const BOTTOM_NAV_ITEMS = Object.freeze([
  { id: "map", label: "Harita", icon: "map-trifold", activeIcon: "map-trifold-fill" },
  { id: "list", label: "Liste", icon: "list-bullets", activeIcon: "list-bullets-fill" },
  { id: "profile", label: "Profil", icon: "user", activeIcon: "user-fill" },
]);
