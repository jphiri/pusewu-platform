"use strict";
const { Pool } = require("pg");
require("dotenv").config();

const useUrl = !!process.env.DATABASE_URL;
const ssl = String(process.env.PGSSL).toLowerCase() === "true"
  ? { rejectUnauthorized: false }
  : false;

const pool = useUrl
  ? new Pool({ connectionString: process.env.DATABASE_URL, ssl })
  : new Pool({
      host: process.env.PGHOST || "localhost",
      port: parseInt(process.env.PGPORT || "5432", 10),
      user: process.env.PGUSER || "pusewu",
      password: process.env.PGPASSWORD || "",
      database: process.env.PGDATABASE || "pusewu",
      ssl,
    });

pool.on("error", (err) => {
  console.error("Unexpected PostgreSQL pool error:", err.message);
});

// Small helper so routes can do `const { rows } = await db.query(sql, params)`
async function query(text, params) {
  return pool.query(text, params);
}

// Run a set of statements inside a transaction
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, withTransaction };
