import { Router } from "express";
import { get, all, run } from "../database.js";
import { authenticateToken } from "../auth.js";

const router = Router();

router.get("/search", authenticateToken, (req, res) => {
  try {
    const query = req.query.q || "";
    const users = all(
      "SELECT id, username, avatar, bio FROM users WHERE username LIKE ? AND id != ? LIMIT 20",
      [`%${query}%`, req.userId]
    );
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:userId", authenticateToken, (req, res) => {
  try {
    const user = get("SELECT id, username, email, avatar, bio, created_at FROM users WHERE id = ?", [req.params.userId]);
    if (!user) return res.status(404).json({ error: "User not found" });

    const postCount = get("SELECT COUNT(*) as count FROM posts WHERE user_id = ?", [req.params.userId]).count;
    const followerCount = get("SELECT COUNT(*) as count FROM follows WHERE following_id = ?", [req.params.userId]).count;
    const followingCount = get("SELECT COUNT(*) as count FROM follows WHERE follower_id = ?", [req.params.userId]).count;
    const isFollowing = get("SELECT 1 as ok FROM follows WHERE follower_id = ? AND following_id = ?", [req.userId, req.params.userId]);

    res.json({ ...user, postCount, followerCount, followingCount, isFollowing: !!isFollowing });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:userId/follow", authenticateToken, (req, res) => {
  try {
    if (req.userId === req.params.userId) return res.status(400).json({ error: "Cannot follow yourself" });

    run("INSERT OR IGNORE INTO follows (follower_id, following_id) VALUES (?, ?)", [req.userId, req.params.userId]);
    res.json({ message: "Followed" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:userId/follow", authenticateToken, (req, res) => {
  try {
    run("DELETE FROM follows WHERE follower_id = ? AND following_id = ?", [req.userId, req.params.userId]);
    res.json({ message: "Unfollowed" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/profile", authenticateToken, (req, res) => {
  try {
    const { bio, avatar } = req.body;
    const updates = [];
    const values = [];

    if (bio !== undefined) { updates.push("bio = ?"); values.push(bio); }
    if (avatar !== undefined) { updates.push("avatar = ?"); values.push(avatar); }

    if (updates.length === 0) return res.status(400).json({ error: "Nothing to update" });

    values.push(req.userId);
    run(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`, values);

    const user = get("SELECT id, username, email, avatar, bio FROM users WHERE id = ?", [req.userId]);
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
