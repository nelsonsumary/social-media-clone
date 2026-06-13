import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { supabase } from "../supabase.js";
import { authenticateToken } from "../auth.js";

const router = Router();

router.get("/:postId/comments", authenticateToken, async (req, res) => {
  try {
    const { data: comments, error } = await supabase
      .from("comments")
      .select("id, content, created_at, user_id, users!inner(username, avatar)")
      .eq("post_id", req.params.postId)
      .order("created_at", { ascending: true });

    if (error) throw error;

    const flat = (comments || []).map((c) => ({
      id: c.id,
      content: c.content,
      created_at: c.created_at,
      user_id: c.user_id,
      username: c.users.username,
      avatar: c.users.avatar,
    }));

    res.json(flat);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:postId/comments", authenticateToken, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: "Comment content is required" });
    }

    const id = uuidv4();
    const { error: insertError } = await supabase
      .from("comments")
      .insert({ id, post_id: req.params.postId, user_id: req.userId, content: content.trim() });

    if (insertError) throw insertError;

    const { data: comment } = await supabase
      .from("comments")
      .select("id, content, created_at, user_id, users!inner(username, avatar)")
      .eq("id", id)
      .single();

    const { data: post } = await supabase
      .from("posts")
      .select("user_id")
      .eq("id", req.params.postId)
      .single();

    if (post && post.user_id !== req.userId) {
      await supabase.from("notifications").insert({
        user_id: post.user_id,
        actor_id: req.userId,
        type: "comment",
        post_id: req.params.postId,
      });
    }

    res.status(201).json({
      id: comment.id,
      content: comment.content,
      created_at: comment.created_at,
      user_id: comment.user_id,
      username: comment.users.username,
      avatar: comment.users.avatar,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/comments/:commentId", authenticateToken, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: "Comment content is required" });
    }

    const { data: existing } = await supabase
      .from("comments")
      .select("id, user_id")
      .eq("id", req.params.commentId)
      .maybeSingle();

    if (!existing) return res.status(404).json({ error: "Comment not found" });
    if (existing.user_id !== req.userId) return res.status(403).json({ error: "Cannot edit someone else's comment" });

    await supabase
      .from("comments")
      .update({ content: content.trim() })
      .eq("id", req.params.commentId);

    const { data: comment } = await supabase
      .from("comments")
      .select("id, content, created_at, user_id, users!inner(username, avatar)")
      .eq("id", req.params.commentId)
      .single();

    res.json({
      id: comment.id,
      content: comment.content,
      created_at: comment.created_at,
      user_id: comment.user_id,
      username: comment.users.username,
      avatar: comment.users.avatar,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/comments/:commentId", authenticateToken, async (req, res) => {
  try {
    const { data: existing } = await supabase
      .from("comments")
      .select("id, user_id")
      .eq("id", req.params.commentId)
      .maybeSingle();

    if (!existing) return res.status(404).json({ error: "Comment not found" });
    if (existing.user_id !== req.userId) return res.status(403).json({ error: "Cannot delete someone else's comment" });

    await supabase.from("comments").delete().eq("id", req.params.commentId);
    res.json({ message: "Comment deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
