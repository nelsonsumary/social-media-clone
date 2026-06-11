import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { get, all, run } from "../database.js";
import { authenticateToken } from "../auth.js";

const router = Router();

router.get("/conversations", authenticateToken, (req, res) => {
  try {
    const users = all(
      `SELECT DISTINCT u.id, u.username, u.avatar,
              (SELECT content FROM messages m2
               WHERE (m2.sender_id = ? AND m2.receiver_id = u.id)
                  OR (m2.sender_id = u.id AND m2.receiver_id = ?)
               ORDER BY m2.created_at DESC LIMIT 1) AS last_message,
              (SELECT created_at FROM messages m3
               WHERE (m3.sender_id = ? AND m3.receiver_id = u.id)
                  OR (m3.sender_id = u.id AND m3.receiver_id = ?)
               ORDER BY m3.created_at DESC LIMIT 1) AS last_message_time
       FROM messages m
       JOIN users u ON (u.id = m.sender_id OR u.id = m.receiver_id)
       WHERE (m.sender_id = ? OR m.receiver_id = ?) AND u.id != ?
       ORDER BY last_message_time DESC`,
      [req.userId, req.userId, req.userId, req.userId, req.userId, req.userId, req.userId]
    );

    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:userId", authenticateToken, (req, res) => {
  try {
    const messages = all(
      `SELECT * FROM messages
       WHERE (sender_id = ? AND receiver_id = ?)
          OR (sender_id = ? AND receiver_id = ?)
       ORDER BY created_at ASC`,
      [req.userId, req.params.userId, req.params.userId, req.userId]
    );

    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:userId", authenticateToken, (req, res) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: "Content is required" });
    }

    const receiver = get("SELECT id FROM users WHERE id = ?", [req.params.userId]);
    if (!receiver) return res.status(404).json({ error: "User not found" });

    const id = uuidv4();
    run("INSERT INTO messages (id, sender_id, receiver_id, content) VALUES (?, ?, ?, ?)", [
      id, req.userId, req.params.userId, content.trim()
    ]);

    const message = get("SELECT * FROM messages WHERE id = ?", [id]);
    res.status(201).json(message);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
