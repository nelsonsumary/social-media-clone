import { Router } from "express";
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { supabase } from "../supabase.js";
import { generateToken } from "../auth.js";

const router = Router();

const stateStore = new Map();

function generateState() {
  return crypto.randomBytes(16).toString("hex");
}

function generateCodeVerifier() {
  return crypto.randomBytes(32).toString("base64url");
}

function generateCodeChallenge(verifier) {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

const APP_URL = () => process.env.APP_URL || "http://localhost:3000";

function redirectUri(provider) {
  return `${APP_URL()}/?oauth=${provider}`;
}

// ── Provider configs ──

const providers = {
  facebook: {
    type: "access_token",
    async getUser(accessToken) {
      const res = await fetch(
        `https://graph.facebook.com/me?fields=id,name,email,picture&access_token=${accessToken}`
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || "Facebook auth failed");
      }
      return res.json();
    },
    mapUser(data) {
      return {
        providerId: data.id,
        email: data.email || `${data.id}@facebook.local`,
        username: data.name?.replace(/\s+/g, "").toLowerCase() || `fb${data.id}`,
        avatar: data.picture?.data?.url || null,
        verified: true,
      };
    },
  },
  linkedin: {
    type: "code",
    authParams() {
      return {
        url: "https://www.linkedin.com/oauth/v2/authorization",
        params: {
          response_type: "code",
          client_id: process.env.LINKEDIN_CLIENT_ID,
          scope: "openid profile email",
        },
      };
    },
    async exchangeCode(code, redirectUri) {
      const params = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: process.env.LINKEDIN_CLIENT_ID,
        client_secret: process.env.LINKEDIN_CLIENT_SECRET,
      });
      const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error_description || "LinkedIn auth failed");
      }
      const data = await res.json();
      return data.access_token;
    },
    async getUser(accessToken) {
      const res = await fetch("https://api.linkedin.com/v2/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error("Failed to fetch LinkedIn user info");
      return res.json();
    },
    mapUser(data) {
      return {
        providerId: data.sub,
        email: data.email || `${data.sub}@linkedin.local`,
        username: data.name?.replace(/\s+/g, "").toLowerCase() || `li${data.sub}`,
        avatar: data.picture || null,
        verified: true,
      };
    },
  },
  twitter: {
    type: "pkce",
    authParams(codeChallenge) {
      return {
        url: "https://twitter.com/i/oauth2/authorize",
        params: {
          response_type: "code",
          client_id: process.env.TWITTER_CLIENT_ID,
          scope: "tweet.read users.read",
          code_challenge: codeChallenge,
          code_challenge_method: "S256",
        },
      };
    },
    async exchangeCode(code, redirectUri, codeVerifier) {
      const params = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: process.env.TWITTER_CLIENT_ID,
        code_verifier: codeVerifier,
      });
      const basicAuth = Buffer.from(
        `${process.env.TWITTER_CLIENT_ID}:${process.env.TWITTER_CLIENT_SECRET}`
      ).toString("base64");
      const res = await fetch("https://api.twitter.com/2/oauth2/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${basicAuth}`,
        },
        body: params,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error_description || "Twitter auth failed");
      }
      const data = await res.json();
      return data.access_token;
    },
    async getUser(accessToken) {
      const res = await fetch(
        "https://api.twitter.com/2/users/me?user.fields=profile_image_url",
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!res.ok) throw new Error("Failed to fetch Twitter user info");
      const json = await res.json();
      return json.data;
    },
    mapUser(data) {
      return {
        providerId: data.id,
        email: `${data.id}@twitter.local`,
        username: data.username || `tw${data.id}`,
        avatar: data.profile_image_url || null,
        verified: true,
      };
    },
  },
  tiktok: {
    type: "code",
    authParams() {
      return {
        url: "https://www.tiktok.com/v2/auth/authorize",
        params: {
          response_type: "code",
          client_key: process.env.TIKTOK_CLIENT_ID,
          scope: "user.info.basic",
        },
      };
    },
    async exchangeCode(code, redirectUri) {
      const params = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_key: process.env.TIKTOK_CLIENT_ID,
        client_secret: process.env.TIKTOK_CLIENT_SECRET,
      });
      const res = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error_description || "TikTok auth failed");
      }
      const data = await res.json();
      return data.access_token;
    },
    async getUser(accessToken) {
      const res = await fetch("https://open.tiktokapis.com/v2/userinfo/", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error("Failed to fetch TikTok user info");
      const json = await res.json();
      return json.data?.user || json;
    },
    mapUser(data) {
      return {
        providerId: data.open_id || data.id,
        email: data.email || `${data.open_id || data.id}@tiktok.local`,
        username: data.display_name?.replace(/\s+/g, "").toLowerCase() || data.username || `tt${data.open_id || data.id}`,
        avatar: data.avatar_url || data.avatar?.url || null,
        verified: true,
      };
    },
  },
  spotify: {
    type: "pkce",
    authParams(codeChallenge) {
      return {
        url: "https://accounts.spotify.com/authorize",
        params: {
          response_type: "code",
          client_id: process.env.SPOTIFY_CLIENT_ID,
          scope: "user-read-email user-read-private",
          code_challenge: codeChallenge,
          code_challenge_method: "S256",
        },
      };
    },
    async exchangeCode(code, redirectUri, codeVerifier) {
      const params = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: process.env.SPOTIFY_CLIENT_ID,
        code_verifier: codeVerifier,
      });
      const basicAuth = Buffer.from(
        `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
      ).toString("base64");
      const res = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${basicAuth}`,
        },
        body: params,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error_description || "Spotify auth failed");
      }
      const data = await res.json();
      return data.access_token;
    },
    async getUser(accessToken) {
      const res = await fetch("https://api.spotify.com/v1/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error("Failed to fetch Spotify user info");
      return res.json();
    },
    mapUser(data) {
      const email = data.email || `${data.id}@spotify.local`;
      const base = (data.display_name || data.id).replace(/\s+/g, "").toLowerCase();
      return {
        providerId: data.id,
        email,
        username: base.slice(0, 20) || `sp${data.id}`,
        avatar: data.images?.[0]?.url || null,
        verified: true,
      };
    },
  },
};

// ── Facebook: access_token based (like Google) ──

router.post("/facebook", async (req, res) => {
  try {
    const { accessToken } = req.body;
    if (!accessToken) return res.status(400).json({ error: "Access token required" });

    const provider = providers.facebook;
    const fbData = await provider.getUser(accessToken);
    const mapped = provider.mapUser(fbData);

    const { user, created } = await findOrCreateUser(mapped, "facebook");
    const token = generateToken(user.id);
    const status = created ? 201 : 200;
    res.status(status).json({ token, user: sanitizeUser(user) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Redirect-based providers (LinkedIn, Twitter, TikTok, Spotify) ──

router.get("/:provider/url", (req, res) => {
  const providerName = req.params.provider;
  const provider = providers[providerName];
  if (!provider || provider.type === "access_token")
    return res.status(400).json({ error: "Unsupported provider or use direct POST" });

  const state = generateState();
  const redirectUriVal = redirectUri(providerName);
  let codeVerifier = null;

  let authUrl, params;
  if (provider.type === "pkce") {
    codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const cfg = provider.authParams(codeChallenge);
    authUrl = cfg.url;
    params = cfg.params;
  } else {
    const cfg = provider.authParams();
    authUrl = cfg.url;
    params = cfg.params;
  }

  params.redirect_uri = redirectUriVal;
  params.state = state;

  stateStore.set(state, {
    provider: providerName,
    codeVerifier,
    redirectUri: redirectUriVal,
    createdAt: Date.now(),
  });

  // Clean old entries after 10 min
  setTimeout(() => stateStore.delete(state), 600000);

  const url = `${authUrl}?${new URLSearchParams(params)}`;
  res.json({ url, state, code_verifier: codeVerifier });
});

router.post("/:provider/callback", async (req, res) => {
  try {
    const providerName = req.params.provider;
    const provider = providers[providerName];
    if (!provider || provider.type === "access_token")
      return res.status(400).json({ error: "Unsupported provider" });

    const { code, state, code_verifier } = req.body;
    if (!code || !state) return res.status(400).json({ error: "Code and state required" });

    const stored = stateStore.get(state);
    if (!stored || stored.provider !== providerName)
      return res.status(400).json({ error: "Invalid or expired state" });

    stateStore.delete(state);

    const redirectUriVal = stored.redirectUri;
    const verifier = code_verifier || stored.codeVerifier;

    let accessToken;
    try {
      accessToken = await provider.exchangeCode(code, redirectUriVal, verifier);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    let providerData;
    try {
      providerData = await provider.getUser(accessToken);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }

    const mapped = provider.mapUser(providerData);
    const { user, created } = await findOrCreateUser(mapped, providerName);
    const token = generateToken(user.id);
    const status = created ? 201 : 200;
    res.status(status).json({ token, user: sanitizeUser(user) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Shared helpers ──

async function findOrCreateUser(mapped, provider) {
  const providerIdField = `${provider}_id`;

  // Check user exists by email first
  let { data: user } = await supabase
    .from("users")
    .select("*")
    .eq("email", mapped.email)
    .maybeSingle();

  if (user) {
    // Update provider ID if missing
    const updates = { verified: true };
    updates[providerIdField] = mapped.providerId;
    if (mapped.avatar && !user.avatar) updates.avatar = mapped.avatar;

    await supabase.from("users").update(updates).eq("id", user.id);
    return { user: { ...user, ...updates }, created: false };
  }

  // Check by provider ID
  const { data: byProvider } = await supabase
    .from("users")
    .select("*")
    .eq(providerIdField, mapped.providerId)
    .maybeSingle();

  if (byProvider) {
    return { user: byProvider, created: false };
  }

  // Create new user
  const id = uuidv4();
  const newUser = {
    id,
    username: mapped.username,
    email: mapped.email,
    password: null,
    avatar: mapped.avatar || null,
    bio: "",
    verified: true,
    [providerIdField]: mapped.providerId,
  };

  // Handle username collision
  const { data: existing } = await supabase
    .from("users")
    .select("id")
    .eq("username", mapped.username)
    .maybeSingle();

  if (existing) {
    newUser.username = `${mapped.username}${Math.floor(Math.random() * 9999)}`;
  }

  const { error } = await supabase.from("users").insert(newUser);
  if (error) throw error;

  return { user: newUser, created: true };
}

function sanitizeUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    avatar: user.avatar,
    bio: user.bio || "",
    verified: user.verified === true,
  };
}

export default router;
