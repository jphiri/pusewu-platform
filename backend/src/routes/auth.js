"use strict";
const express = require("express");
const { z } = require("zod");
const db = require("../db/pool");
const { verifyPassword, signToken } = require("../utils/auth");
const { requireAuth } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/errors");

const router = express.Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// POST /api/auth/login
router.post("/login", asyncHandler(async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const { rows } = await db.query(
    "SELECT * FROM users WHERE lower(email) = lower($1) AND is_active = true",
    [email]
  );
  const user = rows[0];
  if (!user) return res.status(401).json({ error: "Email or password is incorrect." });

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: "Email or password is incorrect." });

  const token = signToken(user);
  res.json({
    token,
    user: {
      id: user.id, email: user.email, role: user.role,
      firstName: user.first_name, surname: user.surname,
      jobTitle: user.job_title, branch: user.branch,
    },
  });
}));

// GET /api/auth/me
router.get("/me", requireAuth, asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    "SELECT id, email, role, first_name, surname, job_title, branch FROM users WHERE id = $1",
    [req.user.sub]
  );
  if (!rows[0]) return res.status(404).json({ error: "User not found." });
  const u = rows[0];
  res.json({ user: {
    id: u.id, email: u.email, role: u.role,
    firstName: u.first_name, surname: u.surname, jobTitle: u.job_title, branch: u.branch,
  }});
}));

module.exports = router;
