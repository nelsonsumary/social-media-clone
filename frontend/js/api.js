const API_BASE = "http://localhost:3000/api";

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

// Auth
function signup(username, email, password) {
  return api("/auth/signup", { method: "POST", body: { username, email, password } });
}

function login(email, password) {
  return api("/auth/login", { method: "POST", body: { email, password } });
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

// Upload
async function uploadImage(file) {
  const formData = new FormData();
  formData.append("image", file);
  return api("/upload", { method: "POST", body: formData });
}
