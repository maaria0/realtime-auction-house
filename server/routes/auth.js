const express = require("express");
const bcrypt = require("bcryptjs");
const { z } = require("zod");

const pool = require("../db");
const { signToken } = require("../middleware/auth");

const router = express.Router();

const registerSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(72),
  displayName: z.string().trim().min(1).max(80).optional(),
});

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

router.post("/register", async (req, res) => {
  let parsed;
  try {
    parsed = registerSchema.parse(req.body);
  } catch (err) {
    const issues = err.errors?.map((e) => e.message).join(", ") || err.message;
    return res.status(400).json({ error: issues });
  }

  const { email, password, displayName } = parsed;

  try {
    const existing = await pool.query(`SELECT id FROM users WHERE email = $1`, [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "An account with this email already exists" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (email, display_name, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, email, display_name`,
      [email, displayName || null, passwordHash]
    );

    const user = result.rows[0];
    const token = signToken(user.id);
    return res.status(201).json({ ...user, token });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post("/login", async (req, res) => {
  let parsed;
  try {
    parsed = loginSchema.parse(req.body);
  } catch (err) {
    const issues = err.errors?.map((e) => e.message).join(", ") || err.message;
    return res.status(400).json({ error: issues });
  }

  const { email, password } = parsed;

  try {
    const result = await pool.query(
      `SELECT id, email, display_name, password_hash FROM users WHERE email = $1`,
      [email]
    );
    const user = result.rows[0];

    if (!user || !user.password_hash) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const matches = await bcrypt.compare(password, user.password_hash);
    if (!matches) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = signToken(user.id);
    return res.json({
      id: user.id,
      email: user.email,
      display_name: user.display_name,
      token,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
