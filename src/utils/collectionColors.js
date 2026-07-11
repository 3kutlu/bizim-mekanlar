export const COLLECTION_COLOR_CODES = Object.freeze([
  "BURGUNDY",
  "PURPLE",
  "BLUE",
  "GREEN",
  "ORANGE",
  "YELLOW",
  "PINK",
  "SLATE",
]);

const COLLECTION_COLOR_CODE_SET = new Set(COLLECTION_COLOR_CODES);

export function normalizeCollectionColorCode(value) {
  const normalized = String(value ?? "BURGUNDY").trim().toUpperCase();
  return COLLECTION_COLOR_CODE_SET.has(normalized) ? normalized : "BURGUNDY";
}

export function getCollectionColorClassName(value) {
  return `collection-color-${normalizeCollectionColorCode(value).toLowerCase()}`;
}
