import { supabase } from "./supabase.js";

let columnMissing = false;

export async function requireVerified(req, res, next) {
  // Pre-migration: allow temporarily if column doesn't exist
  if (columnMissing) return next();

  try {
    let { data: user, error } = await supabase
      .from("users")
      .select("verified")
      .eq("id", req.userId)
      .maybeSingle();

    if (error && error.message?.includes("verified")) {
      columnMissing = true;
      console.warn("⚠ 'verified' column missing - email verification disabled until migration is run.");
      return next();
    }
    if (error) return res.status(500).json({ error: error.message });
    if (!user) {
      const { data: checkUser } = await supabase
        .from("users")
        .select("id")
        .eq("id", req.userId)
        .maybeSingle();
      if (!checkUser) {
        return res.status(404).json({ error: "Your account was not found. Please log out and log back in." });
      }
      columnMissing = true;
      return next();
    }
    if (user.verified === false) return res.status(403).json({ error: "Please verify your email before doing this" });

    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
