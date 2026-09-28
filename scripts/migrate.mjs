// Applies the SQL migrations in ./drizzle. Runs before `next build`, so a
// Vercel deploy brings the database schema up to date by itself. Without
// DATABASE_URL (e.g. a local build with no database) it does nothing.
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.log("[migrate] DATABASE_URL not set; skipping migrations.");
  process.exit(0);
}
const client = postgres(url, { prepare: false, max: 1 });
try {
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  console.log("[migrate] database schema is up to date.");
} catch (err) {
  console.error("[migrate] failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await client.end();
}
