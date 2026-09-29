"use strict";

/**
 * Compute the monthly deduction for a member's basic pay given the union's settings.
 * Mirrors the front-end PUSEWU.computeDeduction so both agree.
 *
 * settings: { configured, deduction_rate, retirement_mode, retirement_share }
 * returns:  { configured, rate, gross, retirement, union }
 */
function computeDeduction(basicPay, settings) {
  const out = {
    configured: !!(settings && settings.configured),
    rate: settings ? num(settings.deduction_rate) : null,
    gross: null,
    retirement: null,
    union: null,
  };
  const bp = num(basicPay);
  const rate = num(settings && settings.deduction_rate);
  if (!out.configured || rate === null || bp === null) return out;

  const gross = round2((bp * rate) / 100);
  let retirement;
  if (settings.retirement_mode === "fixed") {
    retirement = round2(num(settings.retirement_share) || 0);
  } else {
    retirement = round2((gross * (num(settings.retirement_share) || 0)) / 100);
  }
  out.gross = gross;
  out.retirement = retirement;
  out.union = round2(gross - retirement);
  return out;
}

function num(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}
function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

module.exports = { computeDeduction, round2 };
