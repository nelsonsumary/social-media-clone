import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { OAuth2Client } from "google-auth-library";
import { supabase } from "../supabase.js";
import { generateToken, authenticateToken } from "../auth.js";

const router = Router();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

async function sendVerificationEmail(email, token) {
  const serviceUrl = process.env.EMAIL_SERVICE_URL;
  const emailToken = process.env.EMAIL_TOKEN;
  if (!serviceUrl) {
    console.warn("EMAIL_SERVICE_URL not set — skipping verification email. User will remain unverified.");
    return;
  }

  const verifyLink = `${process.env.APP_URL || "http://localhost:3000"}/?verify=${token}`;

  try {
    const res = await fetch(serviceUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: email,
        subject: "Verify your SocialClone account",
        body: `Welcome to SocialClone!\n\nPlease verify your email by clicking the link below:\n\n${verifyLink}\n\nIf you did not sign up, please ignore this email.`,
        token: emailToken,
      }),
    });
    const data = await res.json();
    if (!data.success) console.error("Email service error:", data.error);
  } catch (err) {
    console.error("Failed to send verification email:", err.message);
  }
}

router.post("/signup", async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const { data: existing } = await supabase
      .from("users")
      .select("id")
      .or(`email.eq.${email},username.eq.${username}`)
      .maybeSingle();

    if (existing) return res.status(409).json({ error: "Username or email already exists" });

    const id = uuidv4();
    const hashed = bcrypt.hashSync(password, 12);
    const verificationToken = crypto.randomBytes(32).toString("hex");

    const { error: insertError } = await supabase
      .from("users")
      .insert({ id, username, email, password: hashed, verification_token: verificationToken });

    if (insertError && insertError.message?.includes("column")) {
      // Fallback: columns not migrated yet — insert without verification fields
      await supabase
        .from("users")
        .insert({ id, username, email, password: hashed });
    } else if (insertError) {
      throw insertError;
    }

    sendVerificationEmail(email, verificationToken);

    const token = generateToken(id);
    res.status(201).json({
      token,
      user: { id, username, email, avatar: null, bio: "", verified: false },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email or username and password required" });

    const identifier = email.trim();

    let { data: user, error } = await supabase
      .from("users")
      .select("*")
      .eq("email", identifier)
      .maybeSingle();

    if (!user) {
      const r = await supabase
        .from("users")
        .select("*")
        .eq("username", identifier)
        .maybeSingle();
      user = r.data;
      error = r.error;
    }

    if (error && error.message?.includes("verified")) {
      const r = await supabase
        .from("users")
        .select("id, username, email, password, avatar, bio, created_at")
        .eq("email", identifier)
        .maybeSingle();
      user = r.data;
      if (!user) {
        const r2 = await supabase
          .from("users")
          .select("id, username, email, password, avatar, bio, created_at")
          .eq("username", identifier)
          .maybeSingle();
        user = r2.data;
      }
    }

    if (!user || !user.password || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: "Invalid email/username or password" });
    }

    const token = generateToken(user.id);
    res.json({
      token,
      user: {
        id: user.id, username: user.username, email: user.email,
        avatar: user.avatar, bio: user.bio, verified: user.verified === true,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/google", async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: "Google credential required" });

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    let { data: user, error: findError } = await supabase
      .from("users")
      .select("*")
      .or(`google_id.eq.${payload.sub},email.eq.${payload.email}`)
      .maybeSingle();

    // Fallback if google_id column doesn't exist (pre-migration)
    if (findError && findError.message?.includes("google_id")) {
      const r = await supabase
        .from("users")
        .select("*")
        .eq("email", payload.email)
        .maybeSingle();
      user = r.data;
    }

    if (user) {
      if (!user.google_id) {
        try {
          await supabase
            .from("users")
            .update({ google_id: payload.sub, verified: true })
            .eq("id", user.id);
          user.verified = true;
        } catch {
          // Column doesn't exist yet — ignore
        }
      }

      const token = generateToken(user.id);
      return res.json({
        token,
        user: {
          id: user.id, username: user.username, email: user.email,
          avatar: user.avatar, bio: user.bio, verified: user.verified,
        },
      });
    }

    const id = uuidv4();
    const baseUsername = payload.email.split("@")[0].replace(/[^a-zA-Z0-9]/g, "");
    const username = `${baseUsername}${Math.floor(Math.random() * 9999)}`;

    const { error: insertError } = await supabase
      .from("users")
      .insert({
        id, username, email: payload.email, password: null,
        avatar: payload.picture || null, google_id: payload.sub, verified: true,
      });

    if (insertError && insertError.message?.includes("column")) {
      return res.status(500).json({
        error: "Google sign-in requires database migration. Run schema.sql in Supabase SQL Editor first.",
      });
    }
    if (insertError) throw insertError;

    const token = generateToken(id);
    res.status(201).json({
      token,
      user: {
        id, username, email: payload.email,
        avatar: payload.picture || null, bio: "", verified: true,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/verify/:token", async (req, res) => {
  try {
    const { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("verification_token", req.params.token)
      .maybeSingle();

    if (!user) return res.status(400).json({ error: "Invalid or expired verification token" });

    await supabase
      .from("users")
      .update({ verified: true, verification_token: null })
      .eq("id", user.id);

    res.json({ message: "Email verified successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/resend-verification", authenticateToken, async (req, res) => {
  try {
    const { data: user } = await supabase
      .from("users")
      .select("id, email, verified, verification_token")
      .eq("id", req.userId)
      .maybeSingle();

    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.verified) return res.status(400).json({ error: "Email already verified" });

    const newToken = crypto.randomBytes(32).toString("hex");
    await supabase
      .from("users")
      .update({ verification_token: newToken })
      .eq("id", user.id);

    sendVerificationEmail(user.email, newToken);
    res.json({ message: "Verification email resent" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });

    const { data: user } = await supabase
      .from("users")
      .select("id, email")
      .eq("email", email)
      .maybeSingle();

    if (!user) return res.status(404).json({ error: "No account with that email" });

    const resetToken = crypto.randomBytes(32).toString("hex");
    await supabase.from("users").update({ reset_token: resetToken }).eq("id", user.id);

    const serviceUrl = process.env.EMAIL_SERVICE_URL;
    const emailToken = process.env.EMAIL_TOKEN;
    const resetLink = `${process.env.APP_URL || "http://localhost:3000"}/?reset=${resetToken}`;

    if (serviceUrl) {
      try {
        await fetch(serviceUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: user.email,
            subject: "Reset your SocialClone password",
            body: `You requested a password reset.\n\nClick the link to set a new password:\n\n${resetLink}\n\nIf you did not request this, ignore this email.`,
            token: emailToken,
          }),
        });
      } catch (err) {
        console.error("Failed to send reset email:", err.message);
      }
    }

    res.json({ message: "If that email is registered, a reset link has been sent." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/reset-password", async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: "Token and password are required" });
    if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });

    const { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("reset_token", token)
      .maybeSingle();

    if (!user) return res.status(400).json({ error: "Invalid or expired reset token" });

    const hashed = bcrypt.hashSync(password, 12);
    await supabase
      .from("users")
      .update({ password: hashed, reset_token: null })
      .eq("id", user.id);

    res.json({ message: "Password reset successfully. You can now log in." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/me", authenticateToken, async (req, res) => {
  try {
    let { data: user, error } = await supabase
      .from("users")
      .select("id, username, email, avatar, bio, verified, created_at")
      .eq("id", req.userId)
      .maybeSingle();

    // Fallback if verified column doesn't exist (pre-migration)
    if (error && error.message?.includes("verified")) {
      const r = await supabase
        .from("users")
        .select("id, username, email, avatar, bio, created_at")
        .eq("id", req.userId)
        .maybeSingle();
      user = r.data;
      error = r.error;
      if (user) user.verified = false;
    }

    if (error) return res.status(500).json({ error: error.message });
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/account", authenticateToken, async (req, res) => {
  try {
    await supabase.from("users").delete().eq("id", req.userId);
    res.json({ message: "Account deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
