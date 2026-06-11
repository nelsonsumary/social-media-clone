function isLoggedIn() {
  return !!localStorage.getItem("token");
}

function requireAuth() {
  if (!isLoggedIn()) showAuthPage();
}

function saveSession(token, user) {
  localStorage.setItem("token", token);
  localStorage.setItem("user", JSON.stringify(user));
}

function clearSession() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
}

function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem("user"));
  } catch {
    return null;
  }
}
