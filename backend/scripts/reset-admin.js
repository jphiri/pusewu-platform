"use strict";
/* One-time helper: force-reset (or create) the System Administrator account
   using ADMIN_EMAIL and ADMIN_PASSWORD from the environment.

   Unlike seed.js, this OVERWRITES the password if the account already exists,
   so it fixes a "password is incorrect" situation. Run it once from the
   Render Shell, confirm you can log in, then it never needs running again.

   Usage:  node scripts/reset-admin.js
*/
const { pool } = require("../src/db/pool");
const { hashPassword } = require("../src/utils/auth");

async function run() {
  const email = (process.env.ADMIN_EMAIL || "admin@pusewu.org.zm").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const first = process.env.ADMIN_FIRST_NAME || "System";
  const surname = process.env.ADMIN_SURNAME || "Administrator";

  if (!password) {
    console.error("ADMIN_PASSWORD is not set. Set it in the service's Environment, then re-run.");
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    const hash = await hashPassword(password);
    const existing = await client.query("SELECT id FROM users WHERE lower(email)=lower($1)", [email]);

    if (existing.rowCount) {
      await client.query(
        "UPDATE users SET password_hash=$1, role='admin', is_active=true WHERE lower(email)=lower($2)",
        [hash, email]
      );
      console.log(`Password reset for existing admin: ${email}`);
    } else {
      await client.query(
        `INSERT INTO users (email, role, password_hash, first_name, surname, job_title)
         VALUES ($1,'admin',$2,$3,$4,'System Administrator')`,
        [email, hash, first, surname]
      );
      console.log(`Created new admin: ${email}`);
    }
    console.log("You can now log in with that email and the ADMIN_PASSWORD value.");
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((e) => { console.error("Reset failed:", e.message); process.exit(1); });
