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
    if (!user) return res.status(404).json({ error: "User not found" });
    if (!user.verified) return res.status(403).json({ error: "Please verify your email before doing this" });

    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
