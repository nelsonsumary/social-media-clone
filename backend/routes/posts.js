import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { supabase } from "../supabase.js";
import { authenticateToken } from "../auth.js";
import { requireVerified } from "../verify.js";

const router = Router();

router.get("/", authenticateToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const { data: posts, error } = await supabase
      .from("posts")
      .select("id, content, image, created_at, user_id, users!inner(username, avatar)")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    const flatPosts = (posts || []).map((p) => ({
      id: p.id,
      content: p.content,
      image: p.image,
      created_at: p.created_at,
      user_id: p.user_id,
      username: p.users.username,
      avatar: p.users.avatar,
    }));

    const postIds = flatPosts.map((p) => p.id);

    const { data: allLikes } = await supabase
      .from("likes")
      .select("post_id, user_id")
      .in("post_id", postIds);

    const { data: userLikes } = await supabase
      .from("likes")
      .select("post_id")
      .in("post_id", postIds)
      .eq("user_id", req.userId);

    const { data: allComments } = await supabase
      .from("comments")
      .select("post_id")
      .in("post_id", postIds);

    const likeCounts = {};
    (allLikes || []).forEach((l) => { likeCounts[l.post_id] = (likeCounts[l.post_id] || 0) + 1; });

    const likedSet = new Set((userLikes || []).map((l) => l.post_id));

    const commentCounts = {};
    (allComments || []).forEach((c) => { commentCounts[c.post_id] = (commentCounts[c.post_id] || 0) + 1; });

    flatPosts.forEach((p) => {
      p.likeCount = likeCounts[p.id] || 0;
      p.isLiked = likedSet.has(p.id);
      p.commentCount = commentCounts[p.id] || 0;
    });

    res.json(flatPosts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/user/:userId", authenticateToken, async (req, res) => {
  try {
    const { data: posts, error } = await supabase
      .from("posts")
      .select("id, content, image, created_at, user_id, users!inner(username, avatar)")
      .eq("user_id", req.params.userId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const flatPosts = (posts || []).map((p) => ({
      id: p.id,
      content: p.content,
      image: p.image,
      created_at: p.created_at,
      user_id: p.user_id,
      username: p.users.username,
      avatar: p.users.avatar,
    }));

    const postIds = flatPosts.map((p) => p.id);

    const { data: allLikes } = await supabase
      .from("likes")
      .select("post_id, user_id")
      .in("post_id", postIds);

    const { data: userLikes } = await supabase
      .from("likes")
      .select("post_id")
      .in("post_id", postIds)
      .eq("user_id", req.userId);

    const { data: allComments } = await supabase
      .from("comments")
      .select("post_id")
      .in("post_id", postIds);

    const likeCounts = {};
    (allLikes || []).forEach((l) => { likeCounts[l.post_id] = (likeCounts[l.post_id] || 0) + 1; });

    const likedSet = new Set((userLikes || []).map((l) => l.post_id));

    const commentCounts = {};
    (allComments || []).forEach((c) => { commentCounts[c.post_id] = (commentCounts[c.post_id] || 0) + 1; });

    flatPosts.forEach((p) => {
      p.likeCount = likeCounts[p.id] || 0;
      p.isLiked = likedSet.has(p.id);
      p.commentCount = commentCounts[p.id] || 0;
    });

    res.json(flatPosts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", authenticateToken, requireVerified, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: "Content is required" });
    }

    const id = uuidv4();
    const { error: insertError } = await supabase
      .from("posts")
      .insert({ id, user_id: req.userId, content: content.trim() });

    if (insertError) throw insertError;

    const { data: post } = await supabase
      .from("posts")
      .select("*")
      .eq("id", id)
      .single();

    res.status(201).json(post);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:id/image", authenticateToken, async (req, res) => {
  try {
    const { data: post } = await supabase
      .from("posts")
      .select("id")
      .eq("id", req.params.id)
      .eq("user_id", req.userId)
      .maybeSingle();

    if (!post) return res.status(404).json({ error: "Post not found or unauthorized" });

    const { imageUrl } = req.body;
    await supabase.from("posts").update({ image: imageUrl }).eq("id", req.params.id);
    res.json({ image: imageUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const { data: post, error } = await supabase
      .from("posts")
      .select("id, content, image, created_at, user_id, users!inner(username, avatar)")
      .eq("id", req.params.id)
      .single();

    if (error) return res.status(404).json({ error: "Post not found" });

    res.json({
      id: post.id,
      content: post.content,
      image: post.image,
      created_at: post.created_at,
      user_id: post.user_id,
      username: post.users.username,
      avatar: post.users.avatar,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/:id", authenticateToken, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: "Content is required" });
    }

    const { data: existing } = await supabase
      .from("posts")
      .select("id")
      .eq("id", req.params.id)
      .eq("user_id", req.userId)
      .maybeSingle();

    if (!existing) return res.status(404).json({ error: "Post not found or unauthorized" });

    await supabase
      .from("posts")
      .update({ content: content.trim() })
      .eq("id", req.params.id);

    const { data: post } = await supabase
      .from("posts")
      .select("*")
      .eq("id", req.params.id)
      .single();

    res.json(post);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    const { data: post } = await supabase
      .from("posts")
      .select("id")
      .eq("id", req.params.id)
      .eq("user_id", req.userId)
      .maybeSingle();

    if (!post) return res.status(404).json({ error: "Post not found or unauthorized" });

    await supabase.from("posts").delete().eq("id", req.params.id);
    res.json({ message: "Post deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
