"use strict";
const path = require("path");
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
require("dotenv").config();

const { errorHandler } = require("./middleware/errors");

const app = express();

// Security headers (relax CSP a little so the static frontend + Google Fonts work)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
    },
  },
}));

// CORS — restrict to the configured front-end origin(s)
const origins = (process.env.CORS_ORIGIN || "http://localhost:5173")
  .split(",").map((s) => s.trim()).filter(Boolean);
app.use(cors({
  origin(origin, cb) {
    // allow same-origin / curl (no origin) and any configured origin
    if (!origin || origins.includes(origin)) return cb(null, true);
    return cb(new Error("Not allowed by CORS"));
  },
  credentials: true,
}));

app.use(express.json({ limit: "1mb" }));
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// Basic rate limiting (tighter on auth)
app.use("/api/", rateLimit({ windowMs: 15 * 60 * 1000, max: 300 }));
app.use("/api/auth/login", rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }));

// Health check
app.get("/api/health", (req, res) => res.json({ ok: true, service: "pusewu-backend" }));

// Routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/applications", require("./routes/applications"));
app.use("/api/members", require("./routes/members"));
app.use("/api/finance", require("./routes/finance"));
app.use("/api/admin", require("./routes/admin"));

// 404 for unknown API routes
app.use("/api", (req, res) => res.status(404).json({ error: "Not found." }));

// ---- Serve the frontend (static site + portal) ----
// The frontend folder is mounted/copied next to the backend in production.
const FRONTEND_DIR = process.env.FRONTEND_DIR || path.join(__dirname, "..", "..", "frontend");
app.use(express.static(FRONTEND_DIR, { extensions: ["html"] }));
// Fallback: send index.html for any non-API path so deep links work.
app.get(/^(?!\/api).*/, (req, res, next) => {
  res.sendFile(path.join(FRONTEND_DIR, "index.html"), (err) => {
    if (err) next();
  });
});

// Central error handler (last)
app.use(errorHandler);

module.exports = app;
