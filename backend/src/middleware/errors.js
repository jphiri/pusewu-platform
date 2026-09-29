"use strict";

// Wrap async route handlers so thrown errors reach the error handler
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// Central error handler
function errorHandler(err, req, res, _next) {
  // Zod validation errors
  if (err && err.name === "ZodError") {
    return res.status(400).json({
      error: "Validation failed.",
      details: err.errors.map((e) => ({ path: e.path.join("."), message: e.message })),
    });
  }
  // Postgres unique-violation
  if (err && err.code === "23505") {
    return res.status(409).json({ error: "That record already exists." });
  }
  console.error("API error:", err.message);
  res.status(err.status || 500).json({ error: err.message || "Internal server error." });
}

module.exports = { asyncHandler, errorHandler };
