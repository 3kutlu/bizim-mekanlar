export function formatDate(
  value,
  options = { day: "numeric", month: "long", year: "numeric" }
) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("tr-TR", options).format(date);
}

export function toDateInputValue(value) {
  const normalizedValue = String(value ?? "").trim();

  if (!normalizedValue) {
    return "";
  }

  const isoDate = normalizedValue.match(/^\d{4}-\d{2}-\d{2}/)?.[0];

  if (isoDate) {
    return isoDate;
  }

  const date = new Date(normalizedValue);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function formatRelativeNoteTime(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const elapsed = Math.max(0, Date.now() - date.getTime());

  if (elapsed < 60_000) {
    return "şimdi";
  }

  if (elapsed < 60 * 60_000) {
    return `${Math.floor(elapsed / 60_000)} dk önce`;
  }

  if (elapsed < 24 * 60 * 60_000) {
    return `${Math.floor(elapsed / (60 * 60_000))} sa önce`;
  }

  if (elapsed < 7 * 24 * 60 * 60_000) {
    return `${Math.floor(elapsed / (24 * 60 * 60_000))} gün önce`;
  }

  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "short",
  }).format(date);
}
