import { Router } from "express";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { get, run } from "../database.js";
import { generateToken, authenticateToken } from "../auth.js";

const router = Router();

router.post("/signup", async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const existing = await get("SELECT id FROM users WHERE email = $1 OR username = $2", [email, username]);
    if (existing) return res.status(409).json({ error: "Username or email already exists" });

    const id = uuidv4();
    const hashed = bcrypt.hashSync(password, 10);
    await run("INSERT INTO users (id, username, email, password) VALUES ($1, $2, $3, $4)", [id, username, email, hashed]);

    const token = generateToken(id);
    res.status(201).json({ token, user: { id, username, email, avatar: null, bio: "" } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });

    const user = await get("SELECT * FROM users WHERE email = $1", [email]);
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = generateToken(user.id);
    res.json({
      token,
      user: { id: user.id, username: user.username, email: user.email, avatar: user.avatar, bio: user.bio },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/me", authenticateToken, async (req, res) => {
  try {
    const user = await get("SELECT id, username, email, avatar, bio, created_at FROM users WHERE id = $1", [req.userId]);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/account", authenticateToken, async (req, res) => {
  try {
    await run("DELETE FROM users WHERE id = $1", [req.userId]);
    res.json({ message: "Account deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
