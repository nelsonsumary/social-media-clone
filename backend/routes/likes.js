import { Router } from "express";
import { supabase } from "../supabase.js";
import { authenticateToken } from "../auth.js";

const router = Router();

router.get("/:postId/likes", authenticateToken, async (req, res) => {
  try {
    const postId = req.params.postId;

    const { data: likes, error } = await supabase
      .from("likes")
      .select("user_id, users!inner(username, avatar)")
      .eq("post_id", postId);

    if (error) throw error;

    const isLiked = (likes || []).some((l) => l.user_id === req.userId);

    res.json({
      count: (likes || []).length,
      isLiked,
      users: (likes || []).map((l) => ({
        user_id: l.user_id,
        username: l.users.username,
        avatar: l.users.avatar,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:postId/like", authenticateToken, async (req, res) => {
  try {
    const postId = req.params.postId;
    const userId = req.userId;

    const { data: existing } = await supabase
      .from("likes")
      .select()
      .eq("post_id", postId)
      .eq("user_id", userId)
      .maybeSingle();

    if (existing) return res.status(409).json({ error: "Already liked" });

    await supabase
      .from("likes")
      .insert({ post_id: postId, user_id: userId });

    const { data: post } = await supabase
      .from("posts")
      .select("user_id")
      .eq("id", postId)
      .single();

    if (post && post.user_id !== userId) {
      await supabase.from("notifications").insert({
        user_id: post.user_id,
        actor_id: userId,
        type: "like",
        post_id: postId,
      });
    }

    res.status(201).json({ liked: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:postId/like", authenticateToken, async (req, res) => {
  try {
    const postId = req.params.postId;
    const userId = req.userId;

    const { data: existing } = await supabase
      .from("likes")
      .select()
      .eq("post_id", postId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!existing) return res.status(404).json({ error: "Like not found" });

    await supabase
      .from("likes")
      .delete()
      .eq("post_id", postId)
      .eq("user_id", userId);

    res.json({ liked: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
