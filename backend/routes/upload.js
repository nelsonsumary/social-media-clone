import { Router } from "express";
import multer from "multer";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";
import { authenticateToken } from "../auth.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const storage = multer.diskStorage({
  destination: path.join(__dirname, "..", "uploads"),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    const extOk = allowed.test(path.extname(file.originalname).toLowerCase());
    const mimeOk = allowed.test(file.mimetype.split("/")[1]);
    cb(null, extOk && mimeOk);
  },
});

const router = Router();

router.post("/", authenticateToken, (req, res) => {
  upload.single("image")(req, res, (err) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") return res.status(400).json({ error: "File too large (max 5MB)" });
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const url = `/uploads/${req.file.filename}`;
    res.json({ url });
  });
});

export default router;
