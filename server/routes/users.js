const express = require("express");
const { z } = require("zod");

const pool = require("../db");

const router = express.Router();

const createUserSchema = z.object({
  email: z.string().trim().email(),
  displayName: z.string().trim().min(1).max(80).optional(),
});

router.post("/users", async (req, res) => {
  let parsed;
  try {
    parsed = createUserSchema.parse(req.body);
  } catch (err) {
    const issues = err.errors?.map((e) => e.message).join(", ") || err.message;
    return res.status(400).json({ error: issues });
  }

  const { email, displayName } = parsed;

  try {
    const result = await pool.query(
      `INSERT INTO users (email, display_name)
       VALUES ($1, $2)
       ON CONFLICT (email)
       DO UPDATE SET display_name = COALESCE(EXCLUDED.display_name, users.display_name)
       RETURNING id, email, display_name`,
      [email, displayName || null]
    );
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
