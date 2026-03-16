import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import multer from "multer";
import nodemailer from "nodemailer";
import path from "path";
import { fileURLToPath } from "url";
import db, { initDb } from "./db.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || "change-this-secret";
const EMAIL_USER = process.env.EMAIL_USER || "";
const EMAIL_PASS = process.env.EMAIL_PASS || "";
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL || EMAIL_USER;

app.use(cors({ origin: true }));
app.use(express.json({ limit: "10mb" }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(express.static(path.join(__dirname, "public")));

initDb();

let mailer = null;
if (EMAIL_USER && EMAIL_PASS) {
  mailer = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: EMAIL_USER,
      pass: EMAIL_PASS
    }
  });
}

function createDefaultAdmin() {
  const email = process.env.ADMIN_EMAIL || "admin@pixelframe.local";
  const password = process.env.ADMIN_PASSWORD || "Admin123!";

  db.get("SELECT id FROM users WHERE email = ?", [email], async (err, row) => {
    if (err) {
      console.error("DB error:", err.message);
      return;
    }
    if (!row) {
      const hash = await bcrypt.hash(password, 10);
      db.run(
        "INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'admin')",
        [email, hash]
      );
      console.log("Created default admin:", email);
    }
  });
}

createDefaultAdmin();

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    return next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

// AUTH
app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "Missing credentials" });

  db.get("SELECT * FROM users WHERE email = ?", [email], async (err, user) => {
    if (err) return res.status(500).json({ error: "Server error" });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: "8h" });
    return res.json({ token });
  });
});

// CONTACT
app.post("/api/contact", (req, res) => {
  let { name, email, phone, message, need } = req.body || {};
  if (!message) return res.status(400).json({ error: "Missing message" });
  name = name && name.trim() ? name.trim() : "Anonymous";
  email = email && email.trim() ? email.trim() : "unknown@local";
  phone = phone && phone.trim() ? phone.trim() : "";

  db.run(
    "INSERT INTO contacts (name, email, phone, message, need) VALUES (?, ?, ?, ?, ?)",
    [name, email, phone, message, need || ""],
    function (err) {
      if (err) return res.status(500).json({ error: "Server error" });
      if (mailer && NOTIFY_EMAIL) {
        const subject = `New inquiry: ${name}`;
        const text = [
          `Name: ${name}`,
          `Email: ${email}`,
          `Phone: ${phone || "N/A"}`,
          `Need: ${need || "N/A"}`,
          `Message: ${message}`
        ].join("\n");
        setImmediate(() => {
          mailer.sendMail({
            from: EMAIL_USER,
            to: NOTIFY_EMAIL,
            subject,
            text
          }).catch((mailErr) => {
            console.error("Email send failed:", mailErr.message);
          });
        });
      }
      return res.json({ ok: true, id: this.lastID });
    }
  );
});

app.get("/api/contacts", authMiddleware, (req, res) => {
  db.all("SELECT * FROM contacts ORDER BY created_at DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: "Server error" });
    return res.json(rows);
  });
});

// SERVICES
app.get("/api/services", (req, res) => {
  db.all("SELECT * FROM services ORDER BY created_at DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: "Server error" });
    return res.json(rows);
  });
});

app.post("/api/services", authMiddleware, (req, res) => {
  const { name, description } = req.body || {};
  if (!name) return res.status(400).json({ error: "Missing name" });
  db.run(
    "INSERT INTO services (name, description) VALUES (?, ?)",
    [name, description || ""],
    function (err) {
      if (err) return res.status(500).json({ error: "Server error" });
      return res.json({ ok: true, id: this.lastID });
    }
  );
});

app.put("/api/services/:id", authMiddleware, (req, res) => {
  const { name, description } = req.body || {};
  const { id } = req.params;
  db.run(
    "UPDATE services SET name = ?, description = ? WHERE id = ?",
    [name || "", description || "", id],
    function (err) {
      if (err) return res.status(500).json({ error: "Server error" });
      return res.json({ ok: true, changes: this.changes });
    }
  );
});

app.delete("/api/services/:id", authMiddleware, (req, res) => {
  const { id } = req.params;
  db.run("DELETE FROM services WHERE id = ?", [id], function (err) {
    if (err) return res.status(500).json({ error: "Server error" });
    return res.json({ ok: true, changes: this.changes });
  });
});

// PORTFOLIO ITEMS
app.get("/api/portfolio", (req, res) => {
  const { brand } = req.query;
  const sql = brand ? "SELECT * FROM portfolio_items WHERE brand = ? ORDER BY created_at DESC" : "SELECT * FROM portfolio_items ORDER BY created_at DESC";
  const params = brand ? [brand] : [];
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: "Server error" });
    return res.json(rows);
  });
});

app.post("/api/portfolio", authMiddleware, (req, res) => {
  const { brand, title, type, media_url, thumb_url } = req.body || {};
  if (!brand || !type || !media_url) return res.status(400).json({ error: "Missing fields" });
  db.run(
    "INSERT INTO portfolio_items (brand, title, type, media_url, thumb_url) VALUES (?, ?, ?, ?, ?)",
    [brand, title || "", type, media_url, thumb_url || ""],
    function (err) {
      if (err) return res.status(500).json({ error: "Server error" });
      return res.json({ ok: true, id: this.lastID });
    }
  );
});

app.put("/api/portfolio/:id", authMiddleware, (req, res) => {
  const { brand, title, type, media_url, thumb_url } = req.body || {};
  const { id } = req.params;
  db.run(
    "UPDATE portfolio_items SET brand = ?, title = ?, type = ?, media_url = ?, thumb_url = ? WHERE id = ?",
    [brand || "", title || "", type || "", media_url || "", thumb_url || "", id],
    function (err) {
      if (err) return res.status(500).json({ error: "Server error" });
      return res.json({ ok: true, changes: this.changes });
    }
  );
});

app.delete("/api/portfolio/:id", authMiddleware, (req, res) => {
  const { id } = req.params;
  db.run("DELETE FROM portfolio_items WHERE id = ?", [id], function (err) {
    if (err) return res.status(500).json({ error: "Server error" });
    return res.json({ ok: true, changes: this.changes });
  });
});

// LEGACY PROJECTS (kept for compatibility)
app.get("/api/projects", (req, res) => {
  db.all("SELECT * FROM projects ORDER BY created_at DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: "Server error" });
    return res.json(rows);
  });
});

app.post("/api/projects", authMiddleware, (req, res) => {
  const { title, category, description, image_url } = req.body || {};
  if (!title) return res.status(400).json({ error: "Missing title" });

  db.run(
    "INSERT INTO projects (title, category, description, image_url) VALUES (?, ?, ?, ?)",
    [title, category || "", description || "", image_url || ""],
    function (err) {
      if (err) return res.status(500).json({ error: "Server error" });
      return res.json({ ok: true, id: this.lastID });
    }
  );
});

app.put("/api/projects/:id", authMiddleware, (req, res) => {
  const { title, category, description, image_url } = req.body || {};
  const { id } = req.params;

  db.run(
    "UPDATE projects SET title = ?, category = ?, description = ?, image_url = ? WHERE id = ?",
    [title || "", category || "", description || "", image_url || "", id],
    function (err) {
      if (err) return res.status(500).json({ error: "Server error" });
      return res.json({ ok: true, changes: this.changes });
    }
  );
});

app.delete("/api/projects/:id", authMiddleware, (req, res) => {
  const { id } = req.params;
  db.run("DELETE FROM projects WHERE id = ?", [id], function (err) {
    if (err) return res.status(500).json({ error: "Server error" });
    return res.json({ ok: true, changes: this.changes });
  });
});

// UPLOADS
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, "uploads")),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${Date.now()}_${safe}`);
  }
});

const upload = multer({ storage });

app.post("/api/upload", authMiddleware, upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file" });
  return res.json({ url: `/uploads/${req.file.filename}` });
});

app.get("/health", (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
