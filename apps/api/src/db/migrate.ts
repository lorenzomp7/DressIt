import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./pool.js";

// Works from both src/db (tsx) and dist/db (compiled): migrations/ sits two levels up.
const here = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(here, "../../migrations");

/** Minimal forward-only migration runner: each .sql file runs once, in a transaction. */
export async function migrate(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
    // Serialise concurrent deploys.
    await client.query("SELECT pg_advisory_lock(727274)");

    const applied = new Set(
      (await client.query<{ name: string }>("SELECT name FROM schema_migrations")).rows.map(
        (r) => r.name,
      ),
    );
    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();

    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
      console.log(`Applying migration ${file}`);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }
    await client.query("SELECT pg_advisory_unlock(727274)");
  } finally {
    client.release();
  }
}

// Allow `node dist/db/migrate.js` as a standalone step.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  migrate()
    .then(() => {
      console.log("Migrations up to date");
      return pool.end();
    })
    .catch((err) => {
      console.error("Migration failed", err);
      process.exit(1);
    });
}
