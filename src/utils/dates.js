const ISTANBUL_TIME_ZONE = "Europe/Istanbul";

function getDatePartMap(date, timeZone = ISTANBUL_TIME_ZONE) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
}

/**
 * Database note-date validation uses Europe/Istanbul. Keeping the browser max
 * date on the same calendar avoids the midnight UTC mismatch that can happen
 * before the server date changes.
 */
export function getIstanbulDateInputValue(date = new Date()) {
  const parts = getDatePartMap(date);

  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function isDateAfterIstanbulToday(value, now = new Date()) {
  const candidate = String(value ?? "").trim();

  return Boolean(candidate) && candidate > getIstanbulDateInputValue(now);
}

export { ISTANBUL_TIME_ZONE };
