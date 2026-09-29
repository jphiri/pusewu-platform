"use strict";
const express = require("express");
const { z } = require("zod");
const db = require("../db/pool");
const { hashPassword } = require("../utils/auth");
const { requireAuth, requireRole } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/errors");

const router = express.Router();
const ROLES = ["member", "officer", "finance", "rep", "admin", "exec"];

// ---- Users & roles (System Administrator) ------------------
router.get("/users", requireAuth, requireRole("admin"), asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    "SELECT id, email, role, first_name, surname, job_title, branch, is_active FROM users ORDER BY created_at DESC"
  );
  res.json({ users: rows });
}));

const newUserSchema = z.object({
  firstName: z.string().min(1), surname: z.string().min(1),
  email: z.string().email(), password: z.string().min(6),
  role: z.enum(ROLES), branch: z.string().optional().default(""),
});
router.post("/users", requireAuth, requireRole("admin"), asyncHandler(async (req, res) => {
  const u = newUserSchema.parse(req.body);
  const hash = await hashPassword(u.password);
  const { rows } = await db.query(
    `INSERT INTO users (email, role, password_hash, first_name, surname, job_title, branch)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, email, role`,
    [u.email, u.role, hash, u.firstName, u.surname, u.role, u.branch]
  );
  await db.query(`INSERT INTO audit_log (actor_id, action, entity, entity_id) VALUES ($1,'user.create','user',$2)`,
    [req.user.sub, rows[0].id]);
  res.status(201).json({ ok: true, user: rows[0] });
}));

const roleSchema = z.object({ role: z.enum(ROLES) });
router.patch("/users/:id/role", requireAuth, requireRole("admin"), asyncHandler(async (req, res) => {
  const { role } = roleSchema.parse(req.body);
  await db.query("UPDATE users SET role=$1 WHERE id=$2", [role, req.params.id]);
  await db.query(`INSERT INTO audit_log (actor_id, action, entity, entity_id, detail) VALUES ($1,'user.role','user',$2,$3)`,
    [req.user.sub, req.params.id, JSON.stringify({ role })]);
  res.json({ ok: true });
}));

router.delete("/users/:id", requireAuth, requireRole("admin"), asyncHandler(async (req, res) => {
  if (req.params.id === req.user.sub) return res.status(400).json({ error: "You cannot remove your own account." });
  await db.query("DELETE FROM users WHERE id=$1", [req.params.id]);
  await db.query(`INSERT INTO audit_log (actor_id, action, entity, entity_id) VALUES ($1,'user.delete','user',$2)`,
    [req.user.sub, req.params.id]);
  res.json({ ok: true });
}));

// ---- Branch representative (own branch only) ---------------
router.get("/branch", requireAuth, requireRole("rep"), asyncHandler(async (req, res) => {
  const me = (await db.query("SELECT branch FROM users WHERE id=$1", [req.user.sub])).rows[0];
  const branch = me && me.branch ? me.branch : null;
  const members = await db.query(
    `SELECT u.first_name, u.surname, m.ministry, m.employee_no, m.status
       FROM members m JOIN users u ON u.id = m.user_id
      WHERE m.branch = $1
      ORDER BY u.surname`,
    [branch]
  );
  res.json({ branch, members: members.rows });
}));

// ---- Executive oversight (read-only) -----------------------
router.get("/executive", requireAuth, requireRole("exec", "admin"), asyncHandler(async (req, res) => {
  const byMinistry = await db.query(
    `SELECT ministry,
            count(*) FILTER (WHERE status='paid')    ::int AS paid,
            count(*) FILTER (WHERE status='at-risk') ::int AS at_risk,
            count(*) FILTER (WHERE status='lost')    ::int AS lost
       FROM members WHERE ministry IS NOT NULL GROUP BY ministry ORDER BY ministry`
  );
  const totals = await db.query(
    `SELECT count(*) FILTER (WHERE status='paid')::int AS paid,
            count(*) FILTER (WHERE status='at-risk')::int AS at_risk,
            count(*) FILTER (WHERE status='lost')::int AS lost FROM members`
  );
  res.json({ byMinistry: byMinistry.rows, totals: totals.rows[0] });
}));

module.exports = router;
