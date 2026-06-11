import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { get, all, run } from "../database.js";
import { authenticateToken } from "../auth.js";

const router = Router();

router.get("/conversations", authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    const users = await all(
      `SELECT DISTINCT u.id, u.username, u.avatar,
              (SELECT content FROM messages m2
               WHERE (m2.sender_id = $1 AND m2.receiver_id = u.id)
                  OR (m2.sender_id = u.id AND m2.receiver_id = $2)
               ORDER BY m2.created_at DESC LIMIT 1) AS last_message,
              (SELECT created_at FROM messages m3
               WHERE (m3.sender_id = $3 AND m3.receiver_id = u.id)
                  OR (m3.sender_id = u.id AND m3.receiver_id = $4)
               ORDER BY m3.created_at DESC LIMIT 1) AS last_message_time
       FROM messages m
       JOIN users u ON (u.id = m.sender_id OR u.id = m.receiver_id)
       WHERE (m.sender_id = $5 OR m.receiver_id = $6) AND u.id != $7
       ORDER BY last_message_time DESC`,
      [userId, userId, userId, userId, userId, userId, userId]
    );

    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:userId", authenticateToken, async (req, res) => {
  try {
    const messages = await all(
      `SELECT * FROM messages
       WHERE (sender_id = $1 AND receiver_id = $2)
          OR (sender_id = $3 AND receiver_id = $4)
       ORDER BY created_at ASC`,
      [req.userId, req.params.userId, req.params.userId, req.userId]
    );

    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:userId", authenticateToken, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: "Content is required" });
    }

    const receiver = await get("SELECT id FROM users WHERE id = $1", [req.params.userId]);
    if (!receiver) return res.status(404).json({ error: "User not found" });

    const id = uuidv4();
    await run("INSERT INTO messages (id, sender_id, receiver_id, content) VALUES ($1, $2, $3, $4)", [
      id, req.userId, req.params.userId, content.trim()
    ]);

    const message = await get("SELECT * FROM messages WHERE id = $1", [id]);
    res.status(201).json(message);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
