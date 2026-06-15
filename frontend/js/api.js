const API_BASE = "/api";

async function api(path, options = {}) {
  const token = localStorage.getItem("token");
  const headers = { "Content-Type": "application/json", ...options.headers };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const body = options.body instanceof FormData ? options.body : JSON.stringify(options.body);
  if (options.body instanceof FormData) delete headers["Content-Type"];

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers, body });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

// Config
function getConfig() {
  return api("/config");
}

// Auth
function signup(username, email, password) {
  return api("/auth/signup", { method: "POST", body: { username, email, password } });
}

function login(email, password) {
  return api("/auth/login", { method: "POST", body: { email, password } });
}

function forgotPassword(email) {
  return api("/auth/forgot-password", { method: "POST", body: { email } });
}

function resetPassword(token, password) {
  return api("/auth/reset-password", { method: "POST", body: { token, password } });
}

function googleSignIn(credential) {
  return api("/auth/google", { method: "POST", body: { credential } });
}

function verifyEmail(token) {
  return api(`/auth/verify/${token}`);
}

function resendVerification() {
  return api("/auth/resend-verification", { method: "POST" });
}

function getMe() {
  return api("/auth/me");
}

function deleteAccount() {
  return api("/auth/account", { method: "DELETE" });
}

// Posts
function getFeed(page = 1) {
  return api(`/posts?page=${page}`);
}

function getUserPosts(userId) {
  return api(`/posts/user/${userId}`);
}

function createPost(content) {
  return api("/posts", { method: "POST", body: { content } });
}

function attachPostImage(postId, imageUrl) {
  return api(`/posts/${postId}/image`, { method: "POST", body: { imageUrl } });
}

function getPost(postId) {
  return api(`/posts/${postId}`);
}

function updatePost(postId, content) {
  return api(`/posts/${postId}`, { method: "PUT", body: { content } });
}

function deletePost(postId) {
  return api(`/posts/${postId}`, { method: "DELETE" });
}

// Messages
function getConversations() {
  return api("/messages/conversations");
}

function getMessages(userId) {
  return api(`/messages/${userId}`);
}

function sendMessage(userId, content) {
  return api(`/messages/${userId}`, { method: "POST", body: { content } });
}

function updateMessage(messageId, content) {
  return api(`/messages/item/${messageId}`, { method: "PUT", body: { content } });
}

function deleteMessage(messageId) {
  return api(`/messages/item/${messageId}`, { method: "DELETE" });
}

// Users
function searchUsers(query) {
  return api(`/users/search?q=${encodeURIComponent(query)}`);
}

function getUser(userId) {
  return api(`/users/${userId}`);
}

function followUser(userId) {
  return api(`/users/${userId}/follow`, { method: "POST" });
}

function unfollowUser(userId) {
  return api(`/users/${userId}/follow`, { method: "DELETE" });
}

function updateProfile(data) {
  return api("/users/profile", { method: "PUT", body: data });
}

// Likes
function likePost(postId) {
  return api(`/posts/${postId}/like`, { method: "POST" });
}

function unlikePost(postId) {
  return api(`/posts/${postId}/like`, { method: "DELETE" });
}

function getLikes(postId) {
  return api(`/posts/${postId}/likes`);
}

// Comments
function getComments(postId) {
  return api(`/posts/${postId}/comments`);
}

function addComment(postId, content) {
  return api(`/posts/${postId}/comments`, { method: "POST", body: { content } });
}

function editComment(commentId, content) {
  return api(`/posts/comments/${commentId}`, { method: "PUT", body: { content } });
}

function deleteComment(commentId) {
  return api(`/posts/comments/${commentId}`, { method: "DELETE" });
}

// Notifications
function getNotifications() {
  return api("/notifications");
}

function getUnreadCount() {
  return api("/notifications/unread-count");
}

function markNotificationRead(id) {
  return api(`/notifications/read/${id}`, { method: "POST" });
}

function markAllNotificationsRead() {
  return api("/notifications/read-all", { method: "POST" });
}

// 2FA
function get2FAStatus() {
  return api("/auth/2fa/status");
}

function setup2FA() {
  return api("/auth/2fa/setup", { method: "POST" });
}

function verify2FA(code) {
  return api("/auth/2fa/verify", { method: "POST", body: { code } });
}

function challenge2FA(code, temp_token) {
  return api("/auth/2fa/challenge", { method: "POST", body: { code, temp_token } });
}

function disable2FA(password) {
  return api("/auth/2fa/disable", { method: "POST", body: { password } });
}

// Upload
async function uploadImage(file) {
  const formData = new FormData();
  formData.append("image", file);
  return api("/upload", { method: "POST", body: formData });
}

// OAuth
function facebookSignIn(accessToken) {
  return api("/oauth/facebook", { method: "POST", body: { accessToken } });
}

function getOAuthUrl(provider) {
  return api(`/oauth/${provider}/url`);
}

function completeOAuth(provider, code, state, codeVerifier) {
  return api(`/oauth/${provider}/callback`, {
    method: "POST",
    body: { code, state, code_verifier: codeVerifier },
  });
}

// WebSocket
let ws = null;
const wsHandlers = {};

function onWsMessage(type, handler) {
  wsHandlers[type] = handler;
}

function connectWebSocket(userId) {
  if (ws) ws.close();
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(`${protocol}//${location.host}/?userId=${userId}`);

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      const handler = wsHandlers[data.type];
      if (handler) handler(data);
    } catch {}
  };

  ws.onclose = () => {
    setTimeout(() => connectWebSocket(userId), 3000);
  };
}

function disconnectWebSocket() {
  if (ws) { ws.close(); ws = null; }
}
