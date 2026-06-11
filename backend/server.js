import express from "express";
import cors from "cors";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import { getDb } from "./database.js";

import authRoutes from "./routes/auth.js";
import postRoutes from "./routes/posts.js";
import messageRoutes from "./routes/messages.js";
import userRoutes from "./routes/users.js";
import uploadRoutes from "./routes/upload.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use("/api/auth", authRoutes);
app.use("/api/posts", postRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/users", userRoutes);
app.use("/api/upload", uploadRoutes);

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

getDb().then(() => {
  console.log("Database initialized");
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}).catch((err) => {
  console.error("Database initialization failed:", err);
  process.exit(1);
});
