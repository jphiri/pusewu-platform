"use strict";
const express = require("express");
const { z } = require("zod");
const db = require("../db/pool");
const { requireAuth, requireRole } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/errors");
const { computeDeduction } = require("../utils/finance");

const router = express.Router();

// GET /api/finance/settings  (finance, admin, exec can read)
router.get("/settings", requireAuth, requireRole("finance", "admin", "exec"), asyncHandler(async (req, res) => {
  const { rows } = await db.query("SELECT * FROM settings WHERE id=1");
  res.json({ settings: rows[0] });
}));

const settingsSchema = z.object({
  deductionRate: z.number().positive().max(100),
  retirementMode: z.enum(["percent", "fixed"]),
  retirementShare: z.number().min(0),
  deductionCode: z.string().min(1).optional(),
});

// PUT /api/finance/settings  (finance only)
router.put("/settings", requireAuth, requireRole("finance"), asyncHandler(async (req, res) => {
  const s = settingsSchema.parse(req.body);
  const { rows } = await db.query(
    `UPDATE settings SET deduction_rate=$1, retirement_mode=$2, retirement_share=$3,
        deduction_code=COALESCE($4, deduction_code), configured=true, updated_by=$5
     WHERE id=1 RETURNING *`,
    [s.deductionRate, s.retirementMode, s.retirementShare, s.deductionCode || null, req.user.sub]
  );
  await db.query(
    `INSERT INTO audit_log (actor_id, action, entity, entity_id, detail)
     VALUES ($1,'finance.settings.update','settings','1',$2)`,
    [req.user.sub, JSON.stringify(s)]
  );
  res.json({ ok: true, settings: rows[0] });
}));

// GET /api/finance/pmec  — reconciliation counts by ministry
router.get("/pmec", requireAuth, requireRole("finance", "admin", "exec"), asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT ministry,
            count(*) FILTER (WHERE status='paid')    ::int AS paid,
            count(*) FILTER (WHERE status='at-risk') ::int AS at_risk,
            count(*) FILTER (WHERE status='lost')    ::int AS lost
       FROM members
      WHERE ministry IS NOT NULL
      GROUP BY ministry
      ORDER BY ministry`
  );
  res.json({ ministries: rows });
}));

// GET /api/finance/fund  — retirement fund summary
router.get("/fund", requireAuth, requireRole("finance", "admin", "exec"), asyncHandler(async (req, res) => {
  const s = (await db.query("SELECT * FROM settings WHERE id=1")).rows[0];
  const totalRow = await db.query("SELECT COALESCE(SUM(retirement),0)::numeric AS total FROM contributions");
  const contributors = await db.query("SELECT count(DISTINCT member_id)::int AS n FROM contributions WHERE paid=true");
  const sample = computeDeduction(9500, s);
  res.json({
    fundBalance: Number(totalRow.rows[0].total),
    contributors: contributors.rows[0].n,
    sampleMonthlyCredit: sample.retirement,
    configured: s.configured,
  });
}));

module.exports = router;
