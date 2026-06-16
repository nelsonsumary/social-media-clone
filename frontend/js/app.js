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

function showForgotPasswordPage() {
  const tmpl = document.getElementById("page-forgot-password");
  document.getElementById("app").innerHTML = tmpl.innerHTML;
  document.getElementById("btn-back-to-login").addEventListener("click", (e) => {
    e.preventDefault();
    showAuthPage();
  });
  document.getElementById("form-forgot-password").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("button[type=submit]");
    const errEl = document.getElementById("forgot-error");
    errEl.textContent = "";
    btn.disabled = true;
    btn.innerHTML = '<span class="btn-spinner"></span>';
    try {
      const result = await forgotPassword(e.target.email.value);
      document.getElementById("form-forgot-password").innerHTML = `<p style="text-align:center;color:var(--text-secondary);padding:20px 0">${result.message}</p>`;
    } catch (err) {
      btn.innerHTML = "Send Reset Link";
      btn.disabled = false;
      errEl.textContent = err.message;
    }
  });
}

function showResetPasswordPage(token) {
  const tmpl = document.getElementById("page-reset-password");
  document.getElementById("app").innerHTML = tmpl.innerHTML;
  document.getElementById("form-reset-password").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("button[type=submit]");
    const errEl = document.getElementById("reset-error");
    errEl.textContent = "";
    btn.disabled = true;
    btn.innerHTML = '<span class="btn-spinner"></span>';
    try {
      const result = await resetPassword(token, e.target.password.value);
      document.getElementById("form-reset-password").innerHTML = `<p style="text-align:center;color:var(--text-secondary);padding:20px 0">${result.message}</p><button class="btn-full" onclick="showAuthPage()">Go to Login</button>`;
    } catch (err) {
      btn.innerHTML = "Reset Password";
      btn.disabled = false;
      errEl.textContent = err.message;
    }
  });

  const showPwCb = document.querySelector(".show-password");
  if (showPwCb) {
    showPwCb.addEventListener("change", () => {
      const input = document.getElementById(showPwCb.dataset.target);
      if (input) input.type = showPwCb.checked ? "text" : "password";
    });
  }
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
      shape: "rectangular",
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
  initDarkMode();

  if (user) connectWebSocket(user.id);
  onWsMessage("new_message", (data) => {
    if (currentView === "messages") {
      loadConversations();
      if (currentChatUserId === data.message.sender_id) loadConversation(currentChatUserId);
    }
    updateNotifBadge();
  });

  $$(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$(".nav-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      navigateTo(btn.dataset.view);
    });
  });

  function handleLogout() {
    stopNotificationPolling();
    disconnectWebSocket();
    showAuthPage();
  }

  document.getElementById("btn-logout").addEventListener("click", handleLogout);
  const logoutMobile = document.getElementById("btn-logout-mobile");
  if (logoutMobile) logoutMobile.addEventListener("click", handleLogout);

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
  startNotificationPolling();
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
  else if (view === "notifications") initNotifications();
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

  let tempToken = null;

  document.getElementById("form-login").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const btn = form.querySelector("button[type=submit]");
    const errEl = document.getElementById("login-error");
    errEl.textContent = "";
    btn.disabled = true;
    btn.innerHTML = '<span class="btn-spinner"></span>';
    try {
      const data = await login(form.email.value, form.password.value);
      if (data.requires_2fa) {
        tempToken = data.temp_token;
        document.getElementById("form-login").classList.add("hidden");
        document.getElementById("login-2fa-challenge").classList.remove("hidden");
        document.getElementById("login-2fa-code").focus();
      } else {
        saveSession(data.token, data.user);
        showApp();
      }
    } catch (err) {
      btn.innerHTML = "Log In";
      btn.disabled = false;
      errEl.textContent = err.message;
    }
  });

  document.getElementById("login-2fa-submit-btn").addEventListener("click", async () => {
    const code = document.getElementById("login-2fa-code").value.trim();
    const errEl = document.getElementById("login-2fa-error");
    const btn = document.getElementById("login-2fa-submit-btn");
    errEl.textContent = "";
    if (!code || code.length !== 6) return (errEl.textContent = "Enter the 6-digit code");
    btn.disabled = true;
    btn.innerHTML = '<span class="btn-spinner"></span>';
    try {
      const data = await challenge2FA(code, tempToken);
      saveSession(data.token, data.user);
      showApp();
    } catch (err) {
      btn.innerHTML = "Verify";
      btn.disabled = false;
      errEl.textContent = err.message;
    }
  });

  document.getElementById("login-2fa-code").addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("login-2fa-submit-btn").click();
  });

  document.getElementById("login-2fa-back-btn").addEventListener("click", () => {
    document.getElementById("login-2fa-challenge").classList.add("hidden");
    document.getElementById("form-login").classList.remove("hidden");
    document.getElementById("login-2fa-code").value = "";
    document.getElementById("login-2fa-error").textContent = "";
    tempToken = null;
  });

  document.getElementById("form-signup").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const btn = form.querySelector("button[type=submit]");
    const errEl = document.getElementById("signup-error");
    errEl.textContent = "";
    btn.disabled = true;
    btn.innerHTML = '<span class="btn-spinner"></span>';
    try {
      const data = await signup(form.username.value, form.email.value, form.password.value);
      saveSession(data.token, data.user);
      showApp();
      alert("A verification link has been sent to your email. Please check and click the link to activate your account.");
    } catch (err) {
      btn.innerHTML = "Create Account";
      btn.disabled = false;
      errEl.textContent = err.message;
    }
  });

  const forgotLink = document.getElementById("btn-forgot-password");
  if (forgotLink) {
    forgotLink.addEventListener("click", (e) => {
      e.preventDefault();
      showForgotPasswordPage();
    });
  }

  document.querySelectorAll(".show-password").forEach((cb) => {
    cb.addEventListener("change", () => {
      const input = document.getElementById(cb.dataset.target);
      if (input) input.type = cb.checked ? "text" : "password";
    });
  });

  // OAuth buttons
  document.querySelectorAll(".oauth-btn[data-provider]").forEach((btn) => {
    btn.addEventListener("click", () => handleOAuthClick(btn.dataset.provider));
  });
}

async function handleOAuthClick(provider) {
  if (provider === "facebook") {
    return handleFacebookSignIn();
  }
  // Redirect-based providers
  try {
    const { url, state, code_verifier } = await getOAuthUrl(provider);
    sessionStorage.setItem("oauth_state", state);
    if (code_verifier) sessionStorage.setItem("oauth_code_verifier", code_verifier);
    sessionStorage.setItem("oauth_provider", provider);
    window.location.href = url;
  } catch (err) {
    alert(err.message);
  }
}

async function handleFacebookSignIn() {
  try {
    const config = await getConfig();
    if (!config.facebookClientId) {
      alert("Facebook sign-in is not configured");
      return;
    }
    await loadFacebookSDK(config.facebookClientId);
    const response = await new Promise((resolve, reject) => {
      FB.login(resolve, { scope: "email,public_profile" });
    });
    if (response.status !== "connected") {
      return alert("Facebook sign-in was cancelled");
    }
    const data = await facebookSignIn(response.authResponse.accessToken);
    saveSession(data.token, data.user);
    showApp();
  } catch (err) {
    alert(err.message);
  }
}

function loadFacebookSDK(appId) {
  return new Promise((resolve) => {
    if (window.FB) return resolve();
    window.fbAsyncInit = () => {
      FB.init({ appId, cookie: true, xfbml: true, version: "v18.0" });
      resolve();
    };
    if (!document.getElementById("facebook-jssdk")) {
      const js = document.createElement("script");
      js.id = "facebook-jssdk";
      js.src = "https://connect.facebook.net/en_US/sdk.js";
      document.body.appendChild(js);
    }
  });
}

// ── Feed ──
async function initFeed() {
  const postsEl = document.getElementById("feed-posts");
  postsEl.innerHTML = skeletonFeed();
  try {
    const posts = await getFeed();
    renderPosts(posts, postsEl, true);
  } catch {
    postsEl.innerHTML = '<p class="hint">Failed to load feed. Is the server running?</p>';
  }

  const postBtn = document.getElementById("btn-post");

  if (!isVerified()) {
    postBtn.disabled = true;
    postBtn.title = "Verify your email to post";
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
    container.innerHTML = emptyState("📝", "No posts yet", "Follow some users to see their posts here");
    return;
  }

  container.innerHTML = posts
    .map(
      (p) => `
      <div class="post-card" data-postid="${p.id}">
        <div class="post-header">
          <img src="${p.avatar || ""}" class="post-avatar" onerror="this.src=''" />
          <a href="#" class="post-username" data-userid="${p.user_id}">${p.username}</a>
          <span class="post-time">${formatTime(p.created_at)}</span>
        </div>
        <div class="post-content">${escapeHtml(p.content)}</div>
        ${p.image ? `<img src="${p.image}" class="post-image" />` : ""}
        <div class="post-actions">
          <button class="post-like-btn ${p.isLiked ? "liked" : ""}" data-postid="${p.id}">
            <span class="like-icon">${p.isLiked ? "❤️" : "♡"}</span>
            <span class="like-count" data-count="${p.likeCount}">${p.likeCount}</span>
          </button>
          <button class="post-comment-toggle-btn" data-postid="${p.id}">
            💬 <span class="comment-count">${p.commentCount}</span>
          </button>
          ${showDelete && p.user_id === (getStoredUser()?.id) ? `<button class="post-delete-btn" data-postid="${p.id}">Delete</button>` : ""}
        </div>
        <div class="post-comments-section hidden" data-postid="${p.id}">
          <div class="comments-list" data-postid="${p.id}"></div>
          <div class="comment-input-area">
            <input type="text" class="comment-input" placeholder="Write a comment..." />
            <button class="comment-submit-btn" data-postid="${p.id}">Post</button>
          </div>
        </div>
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

  container.querySelectorAll(".post-like-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const postId = btn.dataset.postid;
      btn.disabled = true;
      try {
        const icon = btn.querySelector(".like-icon");
        const countEl = btn.querySelector(".like-count");
        const isLiked = btn.classList.contains("liked");
        if (isLiked) {
          await unlikePost(postId);
          btn.classList.remove("liked");
          icon.textContent = "♡";
          countEl.textContent = Math.max(0, parseInt(countEl.dataset.count) - 1);
          countEl.dataset.count = Math.max(0, parseInt(countEl.dataset.count) - 1);
        } else {
          await likePost(postId);
          btn.classList.add("liked");
          icon.textContent = "❤️";
          countEl.textContent = parseInt(countEl.dataset.count) + 1;
          countEl.dataset.count = parseInt(countEl.dataset.count) + 1;
        }
      } catch (err) {
        console.error(err);
      }
      btn.disabled = false;
    });
  });

  container.querySelectorAll(".post-comment-toggle-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const postId = btn.dataset.postid;
      const section = container.querySelector(`.post-comments-section[data-postid="${postId}"]`);
      if (!section) return;
      section.classList.toggle("hidden");
      if (!section.classList.contains("hidden") && !section.dataset.loaded) {
        section.dataset.loaded = "true";
        await loadComments(postId, section.querySelector(".comments-list"));
      }
    });
  });

  container.querySelectorAll(".comment-submit-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const postId = btn.dataset.postid;
      const input = btn.closest(".comment-input-area").querySelector(".comment-input");
      const content = input.value.trim();
      if (!content) return;
      input.disabled = true;
      try {
        await addComment(postId, content);
        input.value = "";
        const list = document.querySelector(`.comments-list[data-postid="${postId}"]`);
        await loadComments(postId, list);
        const countEl = document.querySelector(`.post-comment-toggle-btn[data-postid="${postId}"] .comment-count`);
        if (countEl) countEl.textContent = parseInt(countEl.textContent) + 1;
      } catch (err) {
        alert(err.message);
      }
      input.disabled = false;
    });
  });

  container.querySelectorAll(".comment-input").forEach((input) => {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const btn = input.closest(".comment-input-area").querySelector(".comment-submit-btn");
        btn.click();
      }
    });
  });
}

async function loadComments(postId, list) {
  try {
    const comments = await getComments(postId);
    if (!comments.length) {
      list.innerHTML = emptyState("💬", "No comments yet", "Be the first to comment");
      return;
    }
    const userId = getStoredUser()?.id;
    list.innerHTML = comments
      .map(
        (c) => `
        <div class="comment-item" data-commentid="${c.id}">
          <a href="#" class="comment-username" data-userid="${c.user_id}">${c.username}</a>
          <span class="comment-text">${escapeHtml(c.content)}</span>
          ${c.user_id === userId ? `<button class="comment-edit-btn" data-commentid="${c.id}">✎</button><button class="comment-delete-btn" data-commentid="${c.id}">×</button>` : ""}
        </div>
      `
      )
      .join("");

    list.querySelectorAll(".comment-username").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        showUserProfile(el.dataset.userid);
      });
    });

    list.querySelectorAll(".comment-edit-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const item = btn.closest(".comment-item");
        const textSpan = item.querySelector(".comment-text");
        const currentText = textSpan.textContent;
        textSpan.innerHTML = `<input type="text" class="comment-edit-input" value="${escapeHtml(currentText)}" />
          <button class="comment-save-btn">Save</button>
          <button class="comment-cancel-btn">Cancel</button>`;
        const input = textSpan.querySelector(".comment-edit-input");
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
        textSpan.querySelector(".comment-save-btn").addEventListener("click", async () => {
          const newContent = input.value.trim();
          if (!newContent) return;
          try {
            await editComment(btn.dataset.commentid, newContent);
            textSpan.textContent = newContent;
          } catch (err) {
            alert(err.message);
          }
        });
        textSpan.querySelector(".comment-cancel-btn").addEventListener("click", () => {
          textSpan.textContent = currentText;
        });
        input.addEventListener("keydown", (e) => {
          if (e.key === "Enter") textSpan.querySelector(".comment-save-btn").click();
          if (e.key === "Escape") textSpan.querySelector(".comment-cancel-btn").click();
        });
      });
    });

    list.querySelectorAll(".comment-delete-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          await deleteComment(btn.dataset.commentid);
          btn.closest(".comment-item").remove();
        } catch (err) {
          alert(err.message);
        }
      });
    });
  } catch {
    list.innerHTML = '<p class="hint" style="padding:8px 0">Failed to load comments</p>';
  }
}

// ── Messages ──
async function initMessages() {
  const sendBtn = document.getElementById("btn-send-message");
  const msgInput = document.getElementById("message-input");

  if (!isVerified()) {
    sendBtn.disabled = true;
    sendBtn.title = "Verify your email to send messages";
    msgInput.disabled = true;
    msgInput.placeholder = "Verify your email to send messages...";
  } else {
    sendBtn.addEventListener("click", handleSendMessage);
    msgInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleSendMessage();
    });
  }
  document.getElementById("conversations-list").innerHTML = skeletonConversations();
  await loadConversations();
}

async function loadConversations() {
  const list = document.getElementById("conversations-list");
  try {
    const convs = await getConversations();
    if (!convs.length) {
      list.innerHTML = emptyState("💌", "No conversations yet", "Find users to message from the Find tab");
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

    document.querySelector(".messages-layout")?.classList.add("chat-active");
    header.innerHTML = `<button class="msg-back-btn" id="msg-back-btn">&larr;</button> Chat with ${userName}`;
    const backBtn = document.getElementById("msg-back-btn");
    if (backBtn) {
      backBtn.addEventListener("click", () => {
        currentChatUserId = null;
        document.querySelector(".messages-layout")?.classList.remove("chat-active");
        initMessages();
      });
    }

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

  init2FA();
}

async function init2FA() {
  const statusEl = document.getElementById("profile-2fa-status");
  const setupEl = document.getElementById("profile-2fa-setup");
  const disableEl = document.getElementById("profile-2fa-disable");
  if (!statusEl) return;

  try {
    const { totp_enabled } = await get2FAStatus();
    if (totp_enabled) {
      statusEl.innerHTML = '<span style="color:#4caf50;font-weight:600">✅ Two-factor authentication is enabled</span>';
      setupEl.classList.add("hidden");
      disableEl.classList.remove("hidden");
    } else {
      statusEl.innerHTML = '<span style="color:var(--text-muted)">❌ Two-factor authentication is disabled</span>';
      setupEl.classList.remove("hidden");
      disableEl.classList.add("hidden");
      await setup2FAUI();
    }
  } catch {
    statusEl.textContent = "Failed to load 2FA status";
  }
}

async function setup2FAUI() {
  const qrEl = document.getElementById("profile-2fa-qr");
  const secretEl = document.getElementById("profile-2fa-secret");
  const codeInput = document.getElementById("profile-2fa-code");
  const verifyBtn = document.getElementById("profile-2fa-verify-btn");
  const errEl = document.getElementById("profile-2fa-error");

  try {
    const data = await setup2FA();
    qrEl.innerHTML = `<img src="${data.qr_code}" alt="QR Code" style="max-width:200px;border-radius:8px" />`;
    secretEl.textContent = data.secret;
  } catch (err) {
    qrEl.innerHTML = `<p class="auth-error">${err.message}</p>`;
    return;
  }

  verifyBtn.addEventListener("click", async () => {
    const code = codeInput.value.trim();
    errEl.textContent = "";
    if (!code || code.length !== 6) return (errEl.textContent = "Enter the 6-digit code");
    verifyBtn.disabled = true;
    verifyBtn.textContent = "Verifying...";
    try {
      await verify2FA(code);
      alert("2FA enabled successfully!");
      init2FA();
    } catch (err) {
      errEl.textContent = err.message;
    }
    verifyBtn.disabled = false;
    verifyBtn.textContent = "Verify";
  });

  codeInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") verifyBtn.click();
  });

  const disableBtn = document.getElementById("profile-2fa-disable-btn");
  const pwInput = document.getElementById("profile-2fa-password");
  const disableErrEl = document.getElementById("profile-2fa-disable-error");

  disableBtn.addEventListener("click", async () => {
    const password = pwInput.value;
    disableErrEl.textContent = "";
    if (!password) return (disableErrEl.textContent = "Enter your password");
    disableBtn.disabled = true;
    disableBtn.textContent = "Disabling...";
    try {
      await disable2FA(password);
      alert("2FA disabled successfully!");
      init2FA();
    } catch (err) {
      disableErrEl.textContent = err.message;
    }
    disableBtn.disabled = false;
    disableBtn.textContent = "Disable 2FA";
  });

  pwInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") disableBtn.click();
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
  container.innerHTML = skeletonFeed(1);

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

// ── Notifications ──
async function initNotifications() {
  const list = document.getElementById("notifications-list");
  const markAllBtn = document.getElementById("btn-mark-all-read");

  if (!markAllBtn.dataset.attached) {
    markAllBtn.dataset.attached = "true";
    markAllBtn.addEventListener("click", async () => {
      try {
        await markAllNotificationsRead();
        initNotifications();
        updateNotifBadge();
      } catch {}
    });
  }

  list.innerHTML = skeletonNotifications();

  try {
    const notifications = await getNotifications();
    if (!notifications.length) {
      list.innerHTML = emptyState("🔔", "No notifications yet", "Notifications will appear here when someone interacts with you");
      return;
    }
    list.innerHTML = notifications
      .map(
        (n) => `
        <div class="notif-item ${n.read ? "" : "unread"}" data-notifid="${n.id}" data-type="${n.type}" data-actorid="${n.actor_id}">
          <div class="notif-content">
            <a href="#" class="notif-actor" data-userid="${n.actor_id}">${n.username}</a>
            ${notifText(n)}
          </div>
          <div class="notif-time">${formatTime(n.created_at)}</div>
        </div>
      `
      )
      .join("");

    list.querySelectorAll(".notif-item").forEach((item) => {
      item.addEventListener("click", async function () {
        const id = this.dataset.notifid;
        const type = this.dataset.type;
        const actorId = this.dataset.actorid;
        try {
          await markNotificationRead(id);
          this.classList.remove("unread");
          updateNotifBadge();
          if (type === "message" && actorId) {
            currentChatUserId = actorId;
            $$(".nav-btn").forEach((b) => b.classList.remove("active"));
            const msgBtn = document.querySelector('.nav-btn[data-view="messages"]');
            if (msgBtn) msgBtn.classList.add("active");
            navigateTo("messages");
          }
        } catch {}
      });
    });

    list.querySelectorAll(".notif-actor").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        showUserProfile(el.dataset.userid);
      });
    });
  } catch {
    list.innerHTML = '<p class="hint">Failed to load notifications</p>';
  }
}

function notifText(n) {
  switch (n.type) {
    case "like": return `liked your post`;
    case "comment": return `commented on your post`;
    case "follow": return `followed you`;
    case "message": return `sent you a message`;
    default: return `did something`;
  }
}

// ── Dark Mode ──
function initDarkMode() {
  const checkbox = document.getElementById("btn-dark-mode");
  const checkboxMobile = document.getElementById("btn-dark-mode-mobile");

  const saved = localStorage.getItem("darkMode");
  if (saved === "true") {
    document.documentElement.classList.add("dark");
    if (checkbox) checkbox.checked = true;
    if (checkboxMobile) checkboxMobile.checked = true;
  }

  function syncDark(checked) {
    const isDark = checked;
    document.documentElement.classList.toggle("dark", isDark);
    localStorage.setItem("darkMode", isDark);
    if (checkbox) checkbox.checked = isDark;
    if (checkboxMobile) checkboxMobile.checked = isDark;
  }

  if (checkbox) {
    checkbox.addEventListener("change", () => syncDark(checkbox.checked));
  }
  if (checkboxMobile) {
    checkboxMobile.addEventListener("change", () => syncDark(checkboxMobile.checked));
  }
}

// ── Notification Polling ──
let notifPollInterval = null;

function startNotificationPolling() {
  stopNotificationPolling();
  updateNotifBadge();
  notifPollInterval = setInterval(updateNotifBadge, 15000);
}

function stopNotificationPolling() {
  if (notifPollInterval) {
    clearInterval(notifPollInterval);
    notifPollInterval = null;
  }
}

async function updateNotifBadge() {
  const badge = document.getElementById("notif-badge");
  const badgeMobile = document.getElementById("notif-badge-mobile");
  try {
    const data = await getUnreadCount();
    const show = data.count > 0;
    const text = data.count > 99 ? "99+" : data.count;
    if (badge) {
      if (show) {
        badge.textContent = text;
        badge.classList.remove("hidden");
      } else {
        badge.classList.add("hidden");
      }
    }
    if (badgeMobile) {
      if (show) {
        badgeMobile.textContent = text;
        badgeMobile.classList.remove("hidden");
      } else {
        badgeMobile.classList.add("hidden");
      }
    }
  } catch {}
}

// ── Helpers ──
function formatTime(dateStr) {
  if (!dateStr) return "";
  const hasTz = /[+-]\d{2}:\d{2}$|Z$/i.test(dateStr);
  const d = new Date(hasTz ? dateStr : dateStr + "Z");
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString();
}

function skeletonFeed(count = 3) {
  return Array(count).fill().map(() =>
    `<div class="sk-card"><div class="sk-row"><div class="sk-avatar"></div><div class="sk-line" style="width:120px"></div><div class="sk-line" style="width:60px;margin-left:auto"></div></div><div class="sk-line" style="width:100%;height:16px;margin-top:12px"></div><div class="sk-line" style="width:70%;height:16px;margin-top:8px"></div><div class="sk-row" style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border-color)"><div class="sk-line" style="width:60px;height:14px"></div><div class="sk-line" style="width:60px;height:14px"></div></div></div>`
  ).join("");
}

function skeletonConversations(count = 5) {
  return Array(count).fill().map(() =>
    `<div class="sk-card" style="border-radius:0;box-shadow:none;border-bottom:1px solid var(--border-color);margin:0"><div class="sk-row"><div class="sk-avatar"></div><div style="flex:1"><div class="sk-line" style="width:80px;height:14px"></div><div class="sk-line" style="width:160px;height:12px;margin-top:6px"></div></div></div></div>`
  ).join("");
}

function skeletonNotifications(count = 5) {
  return Array(count).fill().map(() =>
    `<div class="sk-card" style="border-radius:12px;margin-bottom:8px"><div class="sk-row"><div class="sk-avatar" style="width:32px;height:32px"></div><div style="flex:1"><div class="sk-line" style="width:200px;height:14px"></div></div><div class="sk-line" style="width:40px;height:12px"></div></div></div>`
  ).join("");
}

function emptyState(icon, title, subtitle) {
  return `<div class="empty-state"><div class="empty-state-icon">${icon}</div><div class="empty-state-title">${title}</div>${subtitle ? `<div class="empty-state-subtitle">${subtitle}</div>` : ""}</div>`;
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
  const resetToken = params.get("reset");

  if (resetToken) {
    showResetPasswordPage(resetToken);
    window.history.replaceState({}, document.title, "/");
    return;
  }

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

  const oauthProvider = params.get("oauth");
  const oauthCode = params.get("code");
  const oauthState = params.get("state");

  if (oauthProvider && oauthCode && oauthState) {
    const storedState = sessionStorage.getItem("oauth_state");
    const codeVerifier = sessionStorage.getItem("oauth_code_verifier");

    if (oauthState !== storedState) {
      showAuthPage();
      window.history.replaceState({}, document.title, "/");
      return;
    }

    sessionStorage.removeItem("oauth_state");
    sessionStorage.removeItem("oauth_code_verifier");
    sessionStorage.removeItem("oauth_provider");

    const authContainer = document.getElementById("app");
    authContainer.innerHTML = '<div class="auth-container"><div class="auth-card"><p style="text-align:center">Completing sign in...</p></div></div>';

    try {
      const data = await completeOAuth(oauthProvider, oauthCode, oauthState, codeVerifier);
      saveSession(data.token, data.user);
      window.history.replaceState({}, document.title, "/");
      showApp();
    } catch (err) {
      showAuthPage();
      window.history.replaceState({}, document.title, "/");
      setTimeout(() => alert(err.message), 100);
    }
    return;
  }

  if (isLoggedIn()) showApp();
  else showAuthPage();
});
