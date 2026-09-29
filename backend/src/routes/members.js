"use strict";
const express = require("express");
const { z } = require("zod");
const db = require("../db/pool");
const { requireAuth, requireRole } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/errors");
const { computeDeduction } = require("../utils/finance");
const { caseRef, loanRef, welfareRef } = require("../utils/refs");

const router = express.Router();

// Resolve the member row for the logged-in user
async function myMember(userId) {
  const { rows } = await db.query("SELECT * FROM members WHERE user_id=$1", [userId]);
  return rows[0] || null;
}
async function getSettings() {
  const { rows } = await db.query("SELECT * FROM settings WHERE id=1");
  return rows[0];
}

// GET /api/members/me — full dashboard payload
router.get("/me", requireAuth, requireRole("member"), asyncHandler(async (req, res) => {
  const m = await myMember(req.user.sub);
  if (!m) return res.status(404).json({ error: "Member profile not found." });
  const settings = await getSettings();
  const deduction = computeDeduction(m.basic_pay, settings);

  const contribs = await db.query(
    "SELECT period, basic_pay, amount, retirement, paid FROM contributions WHERE member_id=$1 ORDER BY period",
    [m.id]
  );
  const contributingMonths = contribs.rows.filter((c) => c.paid).length;
  const retirementTotal = contribs.rows.reduce((s, c) => s + Number(c.retirement || 0), 0);
  const openCases = await db.query(
    "SELECT count(*)::int AS n FROM cases WHERE member_id=$1 AND status NOT IN ('resolved','closed')",
    [m.id]
  );

  res.json({
    member: {
      id: m.id, memberNo: m.member_no, nrc: m.nrc, phone: m.phone,
      ministry: m.ministry, station: m.station, employeeNo: m.employee_no,
      jobTitle: m.job_title, branch: m.branch, basicPay: m.basic_pay,
      status: m.status, joinedOn: m.joined_on, firstContribution: m.first_contribution,
      signedName: m.signed_name,
    },
    deduction,
    settings: {
      deductionRate: settings.deduction_rate, retirementMode: settings.retirement_mode,
      retirementShare: settings.retirement_share, deductionCode: settings.deduction_code,
      currency: settings.currency, configured: settings.configured,
    },
    savings: {
      contributingMonths,
      retirementTotal: Math.round((retirementTotal + Number.EPSILON) * 100) / 100,
      history: contribs.rows,
    },
    openCases: openCases.rows[0].n,
  });
}));

// PATCH /api/members/me — update own editable details
const profileSchema = z.object({
  phone: z.string().optional(), station: z.string().optional(),
  jobTitle: z.string().optional(), ministry: z.string().optional(),
}).strip();
router.patch("/me", requireAuth, requireRole("member"), asyncHandler(async (req, res) => {
  const p = profileSchema.parse(req.body);
  const m = await myMember(req.user.sub);
  if (!m) return res.status(404).json({ error: "Member profile not found." });
  await db.query(
    `UPDATE members SET phone=COALESCE($1,phone), station=COALESCE($2,station),
        job_title=COALESCE($3,job_title), ministry=COALESCE($4,ministry) WHERE id=$5`,
    [p.phone, p.station, p.jobTitle, p.ministry, m.id]
  );
  res.json({ ok: true });
}));

// ---- Cases -------------------------------------------------
router.get("/me/cases", requireAuth, requireRole("member"), asyncHandler(async (req, res) => {
  const m = await myMember(req.user.sub);
  const cases = await db.query("SELECT * FROM cases WHERE member_id=$1 ORDER BY created_at DESC", [m.id]);
  const withEvents = [];
  for (const c of cases.rows) {
    const ev = await db.query("SELECT title, note, created_at FROM case_events WHERE case_id=$1 ORDER BY created_at", [c.id]);
    withEvents.push({ ...c, events: ev.rows });
  }
  res.json({ cases: withEvents });
}));

const caseSchema = z.object({ type: z.string().min(1), detail: z.string().optional().default("") });
router.post("/me/cases", requireAuth, requireRole("member"), asyncHandler(async (req, res) => {
  const { type, detail } = caseSchema.parse(req.body);
  const m = await myMember(req.user.sub);
  const ref = caseRef();
  const c = await db.withTransaction(async (client) => {
    const cr = await client.query(
      `INSERT INTO cases (ref, member_id, type, detail, status, officer, sla)
       VALUES ($1,$2,$3,$4,'received','Awaiting assignment','5 working days') RETURNING *`,
      [ref, m.id, type, detail]
    );
    await client.query("INSERT INTO case_events (case_id, title, note) VALUES ($1,'Received',$2)",
      [cr.rows[0].id, "Your issue has been logged and will be assigned to an officer."]);
    return cr.rows[0];
  });
  res.status(201).json({ ok: true, case: c });
}));

// ---- Loans -------------------------------------------------
const loanSchema = z.object({
  amount: z.number().positive(), term: z.string().optional().default(""), purpose: z.string().optional().default(""),
});
router.get("/me/loans", requireAuth, requireRole("member"), asyncHandler(async (req, res) => {
  const m = await myMember(req.user.sub);
  const { rows } = await db.query("SELECT * FROM loans WHERE member_id=$1 ORDER BY created_at DESC", [m.id]);
  res.json({ loans: rows });
}));
router.post("/me/loans", requireAuth, requireRole("member"), asyncHandler(async (req, res) => {
  const { amount, term, purpose } = loanSchema.parse(req.body);
  const m = await myMember(req.user.sub);
  const { rows } = await db.query(
    `INSERT INTO loans (ref, member_id, amount, term, purpose, status)
     VALUES ($1,$2,$3,$4,$5,'Submitted to partner institution') RETURNING *`,
    [loanRef(), m.id, amount, term, purpose]
  );
  res.status(201).json({ ok: true, loan: rows[0] });
}));

// ---- Welfare ----------------------------------------------
const welfareSchema = z.object({
  relationship: z.string().optional().default(""), deceasedName: z.string().min(1),
});
router.get("/me/welfare", requireAuth, requireRole("member"), asyncHandler(async (req, res) => {
  const m = await myMember(req.user.sub);
  const { rows } = await db.query("SELECT * FROM welfare_claims WHERE member_id=$1 ORDER BY created_at DESC", [m.id]);
  res.json({ claims: rows });
}));
router.post("/me/welfare", requireAuth, requireRole("member"), asyncHandler(async (req, res) => {
  const { relationship, deceasedName } = welfareSchema.parse(req.body);
  const m = await myMember(req.user.sub);
  const { rows } = await db.query(
    `INSERT INTO welfare_claims (ref, member_id, amount, relationship, deceased_name, status)
     VALUES ($1,$2,2000,$3,$4,'under_review') RETURNING *`,
    [welfareRef(), m.id, relationship, deceasedName]
  );
  res.status(201).json({ ok: true, claim: rows[0] });
}));

// ---- Training ----------------------------------------------
router.get("/trainings", requireAuth, requireRole("member"), asyncHandler(async (req, res) => {
  const m = await myMember(req.user.sub);
  const { rows } = await db.query(
    `SELECT t.*, (r.id IS NOT NULL) AS rsvped
       FROM trainings t
       LEFT JOIN training_rsvps r ON r.training_id=t.id AND r.member_id=$1
       ORDER BY t.event_date`, [m.id]);
  res.json({ trainings: rows });
}));
router.post("/trainings/:id/rsvp", requireAuth, requireRole("member"), asyncHandler(async (req, res) => {
  const m = await myMember(req.user.sub);
  await db.query(
    `INSERT INTO training_rsvps (training_id, member_id) VALUES ($1,$2)
     ON CONFLICT (training_id, member_id) DO NOTHING`, [req.params.id, m.id]);
  res.json({ ok: true });
}));

// ---- Case library (read) -----------------------------------
router.get("/case-library", requireAuth, asyncHandler(async (req, res) => {
  const { rows } = await db.query("SELECT * FROM case_library ORDER BY created_at DESC");
  res.json({ library: rows });
}));

module.exports = router;
