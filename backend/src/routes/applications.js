"use strict";
const express = require("express");
const { z } = require("zod");
const db = require("../db/pool");
const { hashPassword } = require("../utils/auth");
const { requireAuth, requireRole } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/errors");
const { appRef, memberNo } = require("../utils/refs");

const router = express.Router();

const applySchema = z.object({
  firstName: z.string().min(1),
  surname: z.string().min(1),
  nrc: z.string().min(3),
  phone: z.string().optional().default(""),
  email: z.string().email(),
  ministry: z.string().min(1),
  branch: z.string().optional().default(""),
  station: z.string().optional().default(""),
  employeeNo: z.string().min(1),
  jobTitle: z.string().min(1),
  basicPay: z.number().positive(),
  switching: z.boolean().optional().default(false),
  priorUnion: z.string().optional().default(""),
  password: z.string().min(6),
  // Typed-name signature: must be full name in CAPITALS (>= two parts)
  signedName: z.string().regex(/^[A-Z][A-Z\s.'-]*[A-Z]$/, "Signature must be your full name in CAPITAL letters")
    .refine((s) => s.trim().split(/\s+/).length >= 2, "Enter your full name (first and surname)"),
});

// POST /api/applications  (public — a prospective member applies)
router.post("/", asyncHandler(async (req, res) => {
  const data = applySchema.parse(req.body);

  const result = await db.withTransaction(async (client) => {
    // Reject if email already used
    const exists = await client.query("SELECT 1 FROM users WHERE lower(email)=lower($1)", [data.email]);
    if (exists.rowCount) {
      const err = new Error("An account with that email already exists.");
      err.status = 409; throw err;
    }

    // Create a pending member user + member profile so they can log in to track status
    const hash = await hashPassword(data.password);
    const userRes = await client.query(
      `INSERT INTO users (email, role, password_hash, first_name, surname, job_title, branch)
       VALUES ($1,'member',$2,$3,$4,$5,$6) RETURNING id`,
      [data.email, hash, data.firstName, data.surname, data.jobTitle, data.branch || data.ministry]
    );
    const userId = userRes.rows[0].id;

    const memberRes = await client.query(
      `INSERT INTO members (user_id, nrc, phone, ministry, station, employee_no, job_title,
                            branch, basic_pay, status, joined_on, signed_name, signed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending',current_date,$10, now())
       RETURNING id`,
      [userId, data.nrc, data.phone, data.ministry, data.station, data.employeeNo,
       data.jobTitle, data.branch || data.ministry, data.basicPay, data.signedName]
    );
    const memberId = memberRes.rows[0].id;

    const ref = appRef();
    await client.query(
      `INSERT INTO applications (ref, first_name, surname, nrc, phone, email, ministry, branch,
                                 station, employee_no, job_title, basic_pay, switching, prior_union,
                                 signed_name, member_id, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'pending_review')`,
      [ref, data.firstName, data.surname, data.nrc, data.phone, data.email, data.ministry,
       data.branch || data.ministry, data.station, data.employeeNo, data.jobTitle, data.basicPay,
       data.switching, data.priorUnion, data.signedName, memberId]
    );

    await client.query(
      `INSERT INTO audit_log (actor_id, action, entity, entity_id, detail)
       VALUES ($1,'application.submit','application',$2,$3)`,
      [userId, ref, JSON.stringify({ email: data.email, switching: data.switching })]
    );

    return { ref, email: data.email };
  });

  res.status(201).json({ ok: true, ref: result.ref, email: result.email });
}));

// GET /api/applications  (officer)
router.get("/", requireAuth, requireRole("officer", "admin"), asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT id, ref, first_name, surname, nrc, ministry, branch, employee_no, job_title,
            basic_pay, switching, prior_union, signed_name, status,
            created_at AS submitted_at, created_at
       FROM applications ORDER BY created_at DESC`
  );
  res.json({ applications: rows });
}));

// POST /api/applications/:id/approve  (officer)
router.post("/:id/approve", requireAuth, requireRole("officer", "admin"), asyncHandler(async (req, res) => {
  const { id } = req.params;
  await db.withTransaction(async (client) => {
    const appRes = await client.query("SELECT * FROM applications WHERE id=$1", [id]);
    const app = appRes.rows[0];
    if (!app) { const e = new Error("Application not found."); e.status = 404; throw e; }

    await client.query(
      "UPDATE applications SET status='approved', reviewed_by=$1, reviewed_at=now() WHERE id=$2",
      [req.user.sub, id]
    );
    if (app.member_id) {
      await client.query(
        "UPDATE members SET status='paid', member_no=COALESCE(member_no,$1), joined_on=COALESCE(joined_on,current_date) WHERE id=$2",
        [memberNo(), app.member_id]
      );
    }
    await client.query(
      `INSERT INTO audit_log (actor_id, action, entity, entity_id) VALUES ($1,'application.approve','application',$2)`,
      [req.user.sub, app.ref]
    );
  });
  res.json({ ok: true });
}));

// POST /api/applications/:id/reject  (officer)
router.post("/:id/reject", requireAuth, requireRole("officer", "admin"), asyncHandler(async (req, res) => {
  const { id } = req.params;
  await db.withTransaction(async (client) => {
    const appRes = await client.query("SELECT * FROM applications WHERE id=$1", [id]);
    const app = appRes.rows[0];
    if (!app) { const e = new Error("Application not found."); e.status = 404; throw e; }
    await client.query(
      "UPDATE applications SET status='rejected', reviewed_by=$1, reviewed_at=now() WHERE id=$2",
      [req.user.sub, id]
    );
    if (app.member_id) {
      await client.query("UPDATE members SET status='rejected' WHERE id=$1", [app.member_id]);
    }
    await client.query(
      `INSERT INTO audit_log (actor_id, action, entity, entity_id) VALUES ($1,'application.reject','application',$2)`,
      [req.user.sub, app.ref]
    );
  });
  res.json({ ok: true });
}));

module.exports = router;
