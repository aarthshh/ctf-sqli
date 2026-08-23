const express = require("express");
const session = require("express-session");
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

// ── Database setup ──────────────────────────────────────────────────────────
const db = new Database(":memory:");

db.exec(`
  CREATE TABLE users (
    id    INTEGER PRIMARY KEY,
    username TEXT,
    password TEXT,
    role     TEXT
  );

  INSERT INTO users (username, password, role) VALUES
    ('guest',   'guest123',          'user'),
    ('admin',   'r4nd0m_P@55w0rd!#', 'admin');

  CREATE TABLE secrets (
    id   INTEGER PRIMARY KEY,
    name TEXT,
    value TEXT
  );

  INSERT INTO secrets (name, value) VALUES
    ('flag_path', '/download/flag');
`);

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(session({
  secret: "ctf-secret-key",
  resave: false,
  saveUninitialized: false,
}));
app.use(express.static(path.join(__dirname, "public")));

// ── Routes ──────────────────────────────────────────────────────────────────

// Landing page
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ── STEP 1: Vulnerable login ────────────────────────────────────────────────
// The query is intentionally concatenated (vulnerable to SQL injection).
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required." });
  }

  // 🔓 VULNERABLE QUERY — intentional for the CTF
  const query = `SELECT * FROM users WHERE username = '${username}' AND password = '${password}'`;

  try {
    const user = db.prepare(query).get();

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials." });
    }

    // Store role in session so /api/secrets and /download/flag can verify
    req.session.role = user.role;

    return res.json({
      message: `Welcome, ${user.username}!`,
      role: user.role,
      id: user.id,
    });
  } catch (err) {
    // Leak DB error to help participants learn
    return res.status(500).json({ error: err.message });
  }
});

// ── STEP 2: Admin-only secrets endpoint (session-gated) ────────────────────
app.get("/api/secrets", (req, res) => {
  if (req.session.role !== "admin") {
    return res.status(403).json({ error: "Admin access required." });
  }

  const rows = db.prepare("SELECT name, value FROM secrets").all();
  return res.json({ secrets: rows });
});

// ── Flag download (session-gated) ───────────────────────────────────────────
app.get("/download/flag", (req, res) => {
  if (req.session.role !== "admin") {
    return res.status(403).json({ error: "Admin access required. Log in first." });
  }

  const flagPath = path.join(__dirname, "public", "flag.zip");
  if (!fs.existsSync(flagPath)) {
    return res.status(404).json({ error: "Flag file not found." });
  }
  res.download(flagPath, "flag.zip");
});

// ── Start ───────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`SQLi challenge running → http://localhost:${PORT}`);
});
