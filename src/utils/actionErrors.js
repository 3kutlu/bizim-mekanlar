import { MESSAGE_KEY, getErrorMessageKey, t } from "../i18n/messages.js";

function cleanText(value) {
  return String(value ?? "").trim();
}

function getErrorText(error) {
  return [error?.message, error?.details, error?.hint, error?.code]
    .map((value) => cleanText(value).toLowerCase())
    .filter(Boolean)
    .join(" ");
}

export function getNoteCreateErrorMessage(error) {
  const messageKey = getErrorMessageKey(error, "");

  if (messageKey) {
    return t(messageKey);
  }

  const raw = getErrorText(error);

  if (raw.includes("ziyaret tarihi gelecekte")) {
    return t(MESSAGE_KEY.NOTE_VISIT_DATE_FUTURE);
  }

  if (raw.includes("network") || raw.includes("failed to fetch")) {
    return t(MESSAGE_KEY.NETWORK_REQUEST_FAILED);
  }

  return t(MESSAGE_KEY.NOTE_CREATE_STAGE_FAILED);
}

export function getPlaceSaveErrorMessage(error) {
  const raw = getErrorText(error);

  if (raw.includes("network") || raw.includes("failed to fetch")) {
    return t(MESSAGE_KEY.NETWORK_REQUEST_FAILED);
  }

  return cleanText(error?.message) || t(MESSAGE_KEY.PLACE_LIST_SAVE_FAILED);
}

export function getCollectionErrorMessage(error, fallback = MESSAGE_KEY.COLLECTION_SAVE_FAILED) {
  const messageKey = getErrorMessageKey(error, "");

  if (messageKey) {
    return t(messageKey);
  }

  const raw = getErrorText(error);

  if (
    error?.code === "23505" ||
    raw.includes("normalizedname") ||
    raw.includes("duplicate key")
  ) {
    return t(MESSAGE_KEY.COLLECTION_NAME_EXISTS);
  }

  if (raw.includes("sistem listesi") || raw.includes("system list")) {
    return t(MESSAGE_KEY.COLLECTION_SYSTEM_DELETE_BLOCKED);
  }

  if (raw.includes("network") || raw.includes("failed to fetch")) {
    return t(MESSAGE_KEY.NETWORK_REQUEST_FAILED);
  }

  return cleanText(error?.message) || t(fallback);
}
