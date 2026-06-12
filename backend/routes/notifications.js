import { Router } from "express";
import { supabase } from "../supabase.js";
import { authenticateToken } from "../auth.js";

const router = Router();

router.get("/", authenticateToken, async (req, res) => {
  try {
    const { data: notifications, error } = await supabase
      .from("notifications")
      .select("id, type, post_id, read, created_at, actor_id, users!inner(username, avatar)")
      .eq("user_id", req.userId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    const flat = (notifications || []).map((n) => ({
      id: n.id,
      type: n.type,
      post_id: n.post_id,
      read: n.read,
      created_at: n.created_at,
      actor_id: n.actor_id,
      username: n.users.username,
      avatar: n.users.avatar,
    }));

    res.json(flat);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/unread-count", authenticateToken, async (req, res) => {
  try {
    const { count, error } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", req.userId)
      .eq("read", false);

    if (error) throw error;
    res.json({ count: count || 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/read/:id", authenticateToken, async (req, res) => {
  try {
    await supabase
      .from("notifications")
      .update({ read: true })
      .eq("id", req.params.id)
      .eq("user_id", req.userId);

    res.json({ message: "Marked as read" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/read-all", authenticateToken, async (req, res) => {
  try {
    await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", req.userId)
      .eq("read", false);

    res.json({ message: "All marked as read" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
