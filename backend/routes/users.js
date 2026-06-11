import { Router } from "express";
import { get, all, run } from "../database.js";
import { authenticateToken } from "../auth.js";

const router = Router();

router.get("/search", authenticateToken, async (req, res) => {
  try {
    const query = req.query.q || "";
    const users = await all(
      "SELECT id, username, avatar, bio FROM users WHERE username LIKE $1 AND id != $2 LIMIT 20",
      [`%${query}%`, req.userId]
    );
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:userId", authenticateToken, async (req, res) => {
  try {
    const user = await get("SELECT id, username, email, avatar, bio, created_at FROM users WHERE id = $1", [req.params.userId]);
    if (!user) return res.status(404).json({ error: "User not found" });

    const postCount = await get("SELECT COUNT(*) as count FROM posts WHERE user_id = $1", [req.params.userId]);
    const followerCount = await get("SELECT COUNT(*) as count FROM follows WHERE following_id = $1", [req.params.userId]);
    const followingCount = await get("SELECT COUNT(*) as count FROM follows WHERE follower_id = $1", [req.params.userId]);
    const isFollowing = await get("SELECT 1 as ok FROM follows WHERE follower_id = $1 AND following_id = $2", [req.userId, req.params.userId]);

    res.json({ ...user, postCount: postCount.count, followerCount: followerCount.count, followingCount: followingCount.count, isFollowing: !!isFollowing });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:userId/follow", authenticateToken, async (req, res) => {
  try {
    if (req.userId === req.params.userId) return res.status(400).json({ error: "Cannot follow yourself" });

    await run(
      "INSERT INTO follows (follower_id, following_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [req.userId, req.params.userId]
    );
    res.json({ message: "Followed" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:userId/follow", authenticateToken, async (req, res) => {
  try {
    await run("DELETE FROM follows WHERE follower_id = $1 AND following_id = $2", [req.userId, req.params.userId]);
    res.json({ message: "Unfollowed" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/profile", authenticateToken, async (req, res) => {
  try {
    const { bio, avatar } = req.body;
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (bio !== undefined) { updates.push(`bio = $${paramIndex++}`); values.push(bio); }
    if (avatar !== undefined) { updates.push(`avatar = $${paramIndex++}`); values.push(avatar); }

    if (updates.length === 0) return res.status(400).json({ error: "Nothing to update" });

    values.push(req.userId);
    await run(`UPDATE users SET ${updates.join(", ")} WHERE id = $${paramIndex}`, values);

    const user = await get("SELECT id, username, email, avatar, bio FROM users WHERE id = $1", [req.userId]);
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
