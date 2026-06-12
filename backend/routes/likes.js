import { Router } from "express";
import { supabase } from "../supabase.js";
import { authenticateToken } from "../auth.js";

const router = Router();

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

    if (existing) {
      await supabase
        .from("likes")
        .delete()
        .eq("post_id", postId)
        .eq("user_id", userId);
      return res.json({ liked: false });
    }

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

    res.json({ liked: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
