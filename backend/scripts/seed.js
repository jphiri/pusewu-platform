"use strict";
/* Production initial setup: creates ONE System Administrator account so the
   union can log in and configure everything (Finance rate, users, etc.).
   No demo members or sample data are created.

   The admin credentials come from environment variables:
     ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_FIRST_NAME, ADMIN_SURNAME
   Falls back to sensible values (printed) if not set, so first-run works;
   change the password immediately after first login.

   Safe to re-run: if the admin email already exists, it is left untouched. */
const { pool } = require("../src/db/pool");
const { hashPassword } = require("../src/utils/auth");

async function run() {
  const email = (process.env.ADMIN_EMAIL || "admin@pusewu.org.zm").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "ChangeMe!" + Math.random().toString(36).slice(2, 8);
  const first = process.env.ADMIN_FIRST_NAME || "System";
  const surname = process.env.ADMIN_SURNAME || "Administrator";

  const client = await pool.connect();
  try {
    // Ensure the settings row exists but stays UNCONFIGURED (Finance sets the rate).
    await client.query("INSERT INTO settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING");

    const exists = await client.query("SELECT 1 FROM users WHERE lower(email)=lower($1)", [email]);
    if (exists.rowCount) {
      console.log(`Admin account ${email} already exists — leaving it unchanged.`);
    } else {
      const hash = await hashPassword(password);
      await client.query(
        `INSERT INTO users (email, role, password_hash, first_name, surname, job_title)
         VALUES ($1,'admin',$2,$3,$4,'System Administrator')`,
        [email, hash, first, surname]
      );
      console.log("Initial administrator created:");
      console.log("  email:    " + email);
      console.log("  password: " + password);
      console.log("  >>> Change this password immediately after first login. <<<");
    }
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((e) => { console.error("Setup failed:", e.message); process.exit(1); });
