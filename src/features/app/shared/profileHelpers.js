export function getFullName(user) {
  return [user?.FirstName, user?.LastName].filter(Boolean).join(" ");
}

export function isPrivateAccount(value) {
  return String(value ?? "").trim().toUpperCase() === "PRIVATE";
}

export function renderUsernameWithLock(username, _isPrivate) {
  const normalizedUsername = String(username ?? "").trim();

  return normalizedUsername;
}
