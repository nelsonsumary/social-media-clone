import { Router } from "express";
import { supabase } from "../supabase.js";
import { authenticateToken } from "../auth.js";

const router = Router();

router.get("/search", authenticateToken, async (req, res) => {
  try {
    const query = req.query.q || "";
    const { data: users, error } = await supabase
      .from("users")
      .select("id, username, avatar, bio")
      .ilike("username", `%${query}%`)
      .neq("id", req.userId)
      .limit(20);

    if (error) throw error;
    res.json(users || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:userId", authenticateToken, async (req, res) => {
  try {
    const { data: user } = await supabase
      .from("users")
      .select("id, username, email, avatar, bio, created_at")
      .eq("id", req.params.userId)
      .maybeSingle();

    if (!user) return res.status(404).json({ error: "User not found" });

    const { count: postCount } = await supabase
      .from("posts")
      .select("*", { count: "exact", head: true })
      .eq("user_id", req.params.userId);

    const { count: followerCount } = await supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("following_id", req.params.userId);

    const { count: followingCount } = await supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("follower_id", req.params.userId);

    const { data: isFollowing } = await supabase
      .from("follows")
      .select("follower_id")
      .eq("follower_id", req.userId)
      .eq("following_id", req.params.userId)
      .maybeSingle();

    res.json({ ...user, postCount, followerCount, followingCount, isFollowing: !!isFollowing });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:userId/follow", authenticateToken, async (req, res) => {
  try {
    if (req.userId === req.params.userId) return res.status(400).json({ error: "Cannot follow yourself" });

    const { error } = await supabase
      .from("follows")
      .insert({ follower_id: req.userId, following_id: req.params.userId });

    if (error && error.code === "23505") {
      return res.json({ message: "Already following" });
    }
    if (error) throw error;

    await supabase.from("notifications").insert({
      user_id: req.params.userId,
      actor_id: req.userId,
      type: "follow",
    });

    res.json({ message: "Followed" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:userId/follow", authenticateToken, async (req, res) => {
  try {
    await supabase
      .from("follows")
      .delete()
      .eq("follower_id", req.userId)
      .eq("following_id", req.params.userId);

    res.json({ message: "Unfollowed" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/profile", authenticateToken, async (req, res) => {
  try {
    const { bio, avatar, username } = req.body;
    const updates = {};
    if (bio !== undefined) updates.bio = bio;
    if (avatar !== undefined) updates.avatar = avatar;
    if (username !== undefined) {
      if (!/^[a-zA-Z0-9_.]+$/.test(username)) {
        return res.status(400).json({ error: "Username can only contain letters, numbers, underscores, and periods" });
      }
      updates.username = username;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "Nothing to update" });
    }

    const { error } = await supabase
      .from("users")
      .update(updates)
      .eq("id", req.userId);

    if (error) throw error;

    const { data: user } = await supabase
      .from("users")
      .select("id, username, email, avatar, bio")
      .eq("id", req.userId)
      .single();

    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
