const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

let currentView = "feed";
let currentChatUserId = null;

// ── Page switching ──
function showVerifyMessage(status, success) {
  const tmpl = document.getElementById("page-verify-message");
  document.getElementById("app").innerHTML = tmpl.innerHTML;
  document.getElementById("verify-status").textContent = status;
  document.getElementById("verify-status").style.color = success ? "#4caf50" : "#f44336";
  if (!success) {
    const btn = document.getElementById("btn-verify-login");
    btn.style.display = "block";
    btn.addEventListener("click", showAuthPage);
  }
}

function showAuthPage() {
  clearSession();
  const tmpl = document.getElementById("page-auth");
  document.getElementById("app").innerHTML = tmpl.innerHTML;
  attachAuthListeners();
  initGoogleButton();
}

async function initGoogleButton() {
  const container = document.getElementById("google-button-container");
  if (!container) return;
  try {
    const config = await getConfig();
    if (!config.googleClientId) return;
    if (typeof google === "undefined" || !google.accounts) {
      setTimeout(initGoogleButton, 500);
      return;
    }
    google.accounts.id.initialize({
      client_id: config.googleClientId,
      callback: handleGoogleCredential,
      auto_prompt: false,
    });
    google.accounts.id.renderButton(container, {
      type: "standard",
      size: "large",
      theme: "outline",
      text: "sign_in_with",
    });
  } catch {}
}

window.handleGoogleCredential = async (response) => {
  try {
    const data = await googleSignIn(response.credential);
    saveSession(data.token, data.user);
    showApp();
  } catch (err) {
    alert(err.message);
  }
};

function showApp() {
  const tmpl = document.getElementById("page-app");
  document.getElementById("app").innerHTML = tmpl.innerHTML;
  const user = getStoredUser();
  document.getElementById("sidebar-username").textContent = user?.username || "";

  updateVerificationBanner();

  $$(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$(".nav-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      navigateTo(btn.dataset.view);
    });
  });

  document.getElementById("btn-logout").addEventListener("click", () => {
    showAuthPage();
  });

  const resendBtn = document.getElementById("btn-resend-verify");
  if (resendBtn) {
    resendBtn.addEventListener("click", async () => {
      try {
        await resendVerification();
        alert("Verification email sent!");
      } catch (err) {
        alert(err.message);
      }
    });
  }

  navigateTo("feed");
}

function updateVerificationBanner() {
  const banner = document.getElementById("verification-banner");
  if (!banner) return;
  if (isVerified()) {
    banner.classList.add("hidden");
  } else {
    banner.classList.remove("hidden");
  }
}

function navigateTo(view) {
  currentView = view;
  const pageContent = document.getElementById("page-content");
  const tmpl = document.getElementById(`page-${view}`);
  if (!tmpl) return;
  pageContent.innerHTML = tmpl.innerHTML;

  if (view === "feed") initFeed();
  else if (view === "messages") initMessages();
  else if (view === "profile") initProfile();
  else if (view === "users") initUsers();
}

// ── Auth Listeners ──
function attachAuthListeners() {
  $$(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      $$(".tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const show = tab.dataset.tab === "login" ? "form-login" : "form-signup";
      const hide = tab.dataset.tab === "login" ? "form-signup" : "form-login";
      document.getElementById(show).classList.remove("hidden");
      document.getElementById(hide).classList.add("hidden");
    });
  });

  document.getElementById("form-login").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const errEl = document.getElementById("login-error");
    try {
      const data = await login(form.email.value, form.password.value);
      saveSession(data.token, data.user);
      showApp();
    } catch (err) {
      errEl.textContent = err.message;
    }
  });

  document.getElementById("form-signup").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const errEl = document.getElementById("signup-error");
    try {
      const data = await signup(form.username.value, form.email.value, form.password.value);
      saveSession(data.token, data.user);
      showApp();
      alert("A verification link has been sent to your email. Please check and click the link to activate your account.");
    } catch (err) {
      errEl.textContent = err.message;
    }
  });
}

// ── Feed ──
async function initFeed() {
  const postsEl = document.getElementById("feed-posts");
  try {
    const posts = await getFeed();
    renderPosts(posts, postsEl, true);
  } catch {
    postsEl.innerHTML = '<p class="hint">Failed to load feed. Is the server running?</p>';
  }

  const postBtn = document.getElementById("btn-post");
  const warning = document.getElementById("post-verify-warning");

  if (!isVerified()) {
    postBtn.disabled = true;
    postBtn.title = "Verify your email to post";
    warning.classList.remove("hidden");
  } else {
    postBtn.addEventListener("click", handleCreatePost);
  }
}

async function handleCreatePost() {
  const content = document.getElementById("post-content").value.trim();
  const fileInput = document.getElementById("post-image");
  const statusEl = document.getElementById("post-status");

  if (!content) return (statusEl.textContent = "Please write something");

  statusEl.textContent = "Posting...";
  try {
    const post = await createPost(content);

    if (fileInput.files[0]) {
      statusEl.textContent = "Uploading image...";
      const uploadResult = await uploadImage(fileInput.files[0]);
      await attachPostImage(post.id, uploadResult.url);
    }

    statusEl.textContent = "Posted!";
    document.getElementById("post-content").value = "";
    fileInput.value = "";
    initFeed();
  } catch (err) {
    statusEl.textContent = err.message;
  }
}

function renderPosts(posts, container, showDelete = false) {
  if (!posts.length) {
    container.innerHTML = '<p class="hint">No posts yet</p>';
    return;
  }

  container.innerHTML = posts
    .map(
      (p) => `
      <div class="post-card">
        <div class="post-header">
          <img src="${p.avatar || ""}" class="post-avatar" onerror="this.src=''" />
          <a href="#" class="post-username" data-userid="${p.user_id}">${p.username}</a>
          <span class="post-time">${formatTime(p.created_at)}</span>
        </div>
        <div class="post-content">${escapeHtml(p.content)}</div>
        ${p.image ? `<img src="${p.image}" class="post-image" />` : ""}
        ${showDelete && p.user_id === (getStoredUser()?.id) ? `<button class="post-delete-btn" data-postid="${p.id}">Delete</button>` : ""}
      </div>
    `
    )
    .join("");

  container.querySelectorAll(".post-delete-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this post?")) return;
      try {
        await deletePost(btn.dataset.postid);
        btn.closest(".post-card").remove();
      } catch (err) {
        alert(err.message);
      }
    });
  });

  container.querySelectorAll(".post-username").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      showUserProfile(el.dataset.userid);
    });
  });
}

// ── Messages ──
async function initMessages() {
  const sendBtn = document.getElementById("btn-send-message");
  const msgInput = document.getElementById("message-input");
  const warning = document.getElementById("msg-verify-warning");

  if (!isVerified()) {
    sendBtn.disabled = true;
    sendBtn.title = "Verify your email to send messages";
    msgInput.disabled = true;
    msgInput.placeholder = "Verify your email to send messages...";
    warning.classList.remove("hidden");
  } else {
    sendBtn.addEventListener("click", handleSendMessage);
    msgInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleSendMessage();
    });
  }
  await loadConversations();
}

async function loadConversations() {
  const list = document.getElementById("conversations-list");
  try {
    const convs = await getConversations();
    if (!convs.length) {
      list.innerHTML = '<p class="hint">No conversations yet. Find users to message!</p>';
      return;
    }
    list.innerHTML = convs
      .map(
        (c) => `
        <div class="conv-item ${c.id === currentChatUserId ? "active" : ""}" data-userid="${c.id}">
          <div class="conv-name">${c.username}</div>
          <div class="conv-preview">${escapeHtml(c.last_message || "No messages")}</div>
        </div>
      `
      )
      .join("");

    list.querySelectorAll(".conv-item").forEach((item) => {
      item.addEventListener("click", () => {
        currentChatUserId = item.dataset.userid;
        loadConversation(currentChatUserId);
        loadConversations();
      });
    });

    if (currentChatUserId) loadConversation(currentChatUserId);
  } catch {
    list.innerHTML = '<p class="hint">Failed to load conversations</p>';
  }
}

async function loadConversation(userId) {
  const header = document.getElementById("message-header");
  const body = document.getElementById("message-body");

  try {
    const msgs = await getMessages(userId);
    const otherUser = msgs.find((m) => m.sender_id !== getStoredUser()?.id);
    const otherName = msgs.length
      ? msgs[0].sender_id === userId
        ? msgs[0].sender_id
        : msgs[0].receiver_id
      : "";

    let userName = "User";
    try {
      const u = await getUser(userId);
      userName = u.username;
    } catch {}

    header.textContent = `Chat with ${userName}`;

    body.innerHTML = msgs
      .map(
        (m) => {
          const sent = m.sender_id === getStoredUser()?.id;
          return `<div class="msg ${sent ? "sent" : "received"}">
            ${escapeHtml(m.content)}
            <div class="msg-time">${formatTime(m.created_at)}</div>
          </div>`;
        }
      )
      .join("");

    body.scrollTop = body.scrollHeight;
  } catch {
    body.innerHTML = '<p class="hint">Could not load messages</p>';
  }
}

async function handleSendMessage() {
  const input = document.getElementById("message-input");
  const content = input.value.trim();
  if (!content || !currentChatUserId) return;

  try {
    await sendMessage(currentChatUserId, content);
    input.value = "";
    loadConversation(currentChatUserId);
  } catch (err) {
    alert(err.message);
  }
}

// ── Profile ──
async function initProfile() {
  const user = getStoredUser();
  if (!user) return;

  document.getElementById("profile-username").textContent = user.username;
  document.getElementById("profile-email").textContent = user.email;
  document.getElementById("profile-verified").textContent = isVerified() ? "✅ Verified" : "❌ Not verified";

  try {
    const profile = await getUser(user.id);
    document.getElementById("profile-bio").textContent = profile.bio || "No bio yet";
    document.getElementById("profile-post-count").textContent = profile.postCount;
    document.getElementById("profile-follower-count").textContent = profile.followerCount;
    document.getElementById("profile-following-count").textContent = profile.followingCount;
    if (profile.avatar) document.getElementById("profile-avatar").src = profile.avatar;

    const posts = await getUserPosts(user.id);
    renderPosts(posts, document.getElementById("profile-posts"), true);
  } catch {}

  document.getElementById("btn-save-profile").addEventListener("click", async () => {
    const bio = document.getElementById("edit-bio").value.trim();
    const avatarFile = document.getElementById("edit-avatar").files[0];

    try {
      const update = { bio: bio || undefined };
      if (avatarFile) {
        const upload = await uploadImage(avatarFile);
        update.avatar = upload.url;
      }
      const updated = await updateProfile(update);
      document.getElementById("profile-bio").textContent = updated.bio || "No bio yet";
      if (updated.avatar) document.getElementById("profile-avatar").src = updated.avatar;
      const stored = getStoredUser();
      stored.bio = updated.bio;
      stored.avatar = updated.avatar;
      localStorage.setItem("user", JSON.stringify(stored));
      alert("Profile updated!");
    } catch (err) {
      alert(err.message);
    }
  });

  document.getElementById("btn-delete-account").addEventListener("click", async () => {
    if (!confirm("Are you sure you want to delete your account? This cannot be undone!")) return;
    try {
      await deleteAccount();
      showAuthPage();
    } catch (err) {
      alert(err.message);
    }
  });
}

// ── Find Users ──
async function initUsers() {
  const searchInput = document.getElementById("user-search");
  const resultsEl = document.getElementById("user-results");

  let debounceTimer;
  searchInput.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      const q = searchInput.value.trim();
      if (!q) { resultsEl.innerHTML = ""; return; }
      try {
        const users = await searchUsers(q);
        resultsEl.innerHTML = users
          .map(
            (u) => `
            <div class="user-card">
              <div class="user-card-info">
                <img src="${u.avatar || ""}" class="user-card-img" onerror="this.src=''" />
                <div>
                  <div class="user-card-name">${u.username}</div>
                  <div style="font-size:13px;color:#888">${escapeHtml(u.bio || "")}</div>
                </div>
              </div>
              <div>
                <button class="user-card-btn" data-action="msg" data-userid="${u.id}">Message</button>
                <button class="user-card-btn" data-action="view" data-userid="${u.id}">View</button>
              </div>
            </div>
          `
          )
          .join("");

        resultsEl.querySelectorAll("[data-action=msg]").forEach((btn) => {
          btn.addEventListener("click", () => {
            currentChatUserId = btn.dataset.userid;
            navigateTo("messages");
          });
        });

        resultsEl.querySelectorAll("[data-action=view]").forEach((btn) => {
          btn.addEventListener("click", () => showUserProfile(btn.dataset.userid));
        });
      } catch {}
    }, 300);
  });
}

// ── View another user's profile ──
async function showUserProfile(userId) {
  const container = document.getElementById("page-content");
  container.innerHTML = "<p class='hint'>Loading profile...</p>";

  try {
    const user = await getUser(userId);
    const posts = await getUserPosts(userId);

    container.innerHTML = `
      <div class="profile-container">
        <h2>${user.username}</h2>
        <div class="profile-card">
          <div class="profile-avatar-container">
            <img src="${user.avatar || ""}" class="profile-avatar" onerror="this.src=''" />
          </div>
          <p><strong>Bio:</strong> ${escapeHtml(user.bio || "No bio")}</p>
          <div class="profile-stats">
            <span>Posts: <strong>${user.postCount}</strong></span>
            <span>Followers: <strong>${user.followerCount}</strong></span>
            <span>Following: <strong>${user.followingCount}</strong></span>
          </div>
          <button id="btn-user-follow" class="user-card-btn">${user.isFollowing ? "Unfollow" : "Follow"}</button>
          <button id="btn-user-message" class="user-card-btn">Send Message</button>
          <button id="btn-user-back" class="user-card-btn" style="background:#888">Back</button>
        </div>
        <h3>Posts</h3>
        <div id="profile-posts"></div>
      </div>
    `;

    renderPosts(posts, document.getElementById("profile-posts"));

    document.getElementById("btn-user-follow").addEventListener("click", async () => {
      try {
        if (user.isFollowing) await unfollowUser(userId);
        else await followUser(userId);
        showUserProfile(userId);
      } catch (err) { alert(err.message); }
    });

    document.getElementById("btn-user-message").addEventListener("click", () => {
      currentChatUserId = userId;
      navigateTo("messages");
    });

    document.getElementById("btn-user-back").addEventListener("click", () => navigateTo("feed"));
  } catch {
    container.innerHTML = '<p class="hint">User not found</p>';
  }
}

// ── Helpers ──
function formatTime(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "Z");
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString();
}

function escapeHtml(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ── Init ──
document.addEventListener("DOMContentLoaded", async () => {
  const params = new URLSearchParams(window.location.search);
  const verifyToken = params.get("verify");

  if (verifyToken) {
    try {
      const result = await verifyEmail(verifyToken);
      showVerifyMessage(result.message || "Email verified successfully!", true);
      window.history.replaceState({}, document.title, "/");

      // If already logged in, update stored user
      const user = getStoredUser();
      if (user) {
        user.verified = true;
        localStorage.setItem("user", JSON.stringify(user));
      }
    } catch (err) {
      showVerifyMessage(err.message || "Verification failed. The link may be expired.", false);
      window.history.replaceState({}, document.title, "/");
    }
    return;
  }

  if (isLoggedIn()) showApp();
  else showAuthPage();
});
