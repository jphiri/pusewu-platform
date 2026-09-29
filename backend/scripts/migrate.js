"use strict";
const fs = require("fs");
const path = require("path");
const { pool } = require("../src/db/pool");

async function run() {
  const dir = path.join(__dirname, "..", "migrations");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  console.log(`Running ${files.length} migration(s)...`);
  for (const f of files) {
    const sql = fs.readFileSync(path.join(dir, f), "utf8");
    process.stdout.write(`  • ${f} ... `);
    await pool.query(sql);
    console.log("done");
  }
  await pool.end();
  console.log("Migrations complete.");
}

run().catch((e) => {
  console.error("Migration failed:", e.message);
  process.exit(1);
});
