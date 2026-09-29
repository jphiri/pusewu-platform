"use strict";
const app = require("./app");
const { pool } = require("./db/pool");
require("dotenv").config();

const PORT = parseInt(process.env.PORT || "4000", 10);

const HOST = process.env.HOST || "0.0.0.0";

const server = app.listen(PORT, HOST, () => {
  console.log(`PUSEWU backend listening on port ${PORT}`);
});

// Graceful shutdown
function shutdown(signal) {
  console.log(`\n${signal} received — shutting down.`);
  server.close(() => {
    pool.end().then(() => process.exit(0));
  });
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
