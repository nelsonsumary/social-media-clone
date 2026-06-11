import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { get, all, run } from "../database.js";
import { authenticateToken } from "../auth.js";

const router = Router();

router.get("/", authenticateToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const posts = await all(
      `SELECT p.id, p.content, p.image, p.created_at,
              u.id AS user_id, u.username, u.avatar
       FROM posts p
       JOIN users u ON p.user_id = u.id
       ORDER BY p.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/user/:userId", authenticateToken, async (req, res) => {
  try {
    const posts = await all(
      `SELECT p.id, p.content, p.image, p.created_at,
              u.id AS user_id, u.username, u.avatar
       FROM posts p
       JOIN users u ON p.user_id = u.id
       WHERE p.user_id = $1
       ORDER BY p.created_at DESC`,
      [req.params.userId]
    );

    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", authenticateToken, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: "Content is required" });
    }

    const id = uuidv4();
    await run("INSERT INTO posts (id, user_id, content) VALUES ($1, $2, $3)", [id, req.userId, content.trim()]);

    const post = await get("SELECT * FROM posts WHERE id = $1", [id]);
    res.status(201).json(post);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:id/image", authenticateToken, async (req, res) => {
  try {
    const post = await get("SELECT * FROM posts WHERE id = $1 AND user_id = $2", [req.params.id, req.userId]);
    if (!post) return res.status(404).json({ error: "Post not found or unauthorized" });

    const { imageUrl } = req.body;
    await run("UPDATE posts SET image = $1 WHERE id = $2", [imageUrl, req.params.id]);
    res.json({ image: imageUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    const result = await run("DELETE FROM posts WHERE id = $1 AND user_id = $2", [req.params.id, req.userId]);
    if (result.changes === 0) return res.status(404).json({ error: "Post not found or unauthorized" });
    res.json({ message: "Post deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
