import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { get, all, run } from "../database.js";
import { authenticateToken } from "../auth.js";

const router = Router();

router.get("/", authenticateToken, (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const posts = all(
      `SELECT p.id, p.content, p.image, p.created_at,
              u.id AS user_id, u.username, u.avatar
       FROM posts p
       JOIN users u ON p.user_id = u.id
       ORDER BY p.created_at DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/user/:userId", authenticateToken, (req, res) => {
  try {
    const posts = all(
      `SELECT p.id, p.content, p.image, p.created_at,
              u.id AS user_id, u.username, u.avatar
       FROM posts p
       JOIN users u ON p.user_id = u.id
       WHERE p.user_id = ?
       ORDER BY p.created_at DESC`,
      [req.params.userId]
    );

    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", authenticateToken, (req, res) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: "Content is required" });
    }

    const id = uuidv4();
    run("INSERT INTO posts (id, user_id, content) VALUES (?, ?, ?)", [id, req.userId, content.trim()]);

    const post = get("SELECT * FROM posts WHERE id = ?", [id]);
    res.status(201).json(post);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:id/image", authenticateToken, (req, res) => {
  try {
    const post = get("SELECT * FROM posts WHERE id = ? AND user_id = ?", [req.params.id, req.userId]);
    if (!post) return res.status(404).json({ error: "Post not found or unauthorized" });

    const { imageUrl } = req.body;
    run("UPDATE posts SET image = ? WHERE id = ?", [imageUrl, req.params.id]);
    res.json({ image: imageUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:id", authenticateToken, (req, res) => {
  try {
    const result = run("DELETE FROM posts WHERE id = ? AND user_id = ?", [req.params.id, req.userId]);
    if (result.changes === 0) return res.status(404).json({ error: "Post not found or unauthorized" });
    res.json({ message: "Post deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
