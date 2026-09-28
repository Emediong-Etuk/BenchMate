import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// One lazily created client per server instance. `prepare: false` keeps it
// compatible with pooled (PgBouncer) connection strings such as Neon's.

type Db = ReturnType<typeof drizzle<typeof schema>>;

const globalForDb = globalThis as unknown as { benchmateDb?: Db };

export function dbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function getDb(): Db {
  if (globalForDb.benchmateDb) return globalForDb.benchmateDb;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const client = postgres(url, { prepare: false, max: 5 });
  const db = drizzle(client, { schema });
  globalForDb.benchmateDb = db;
  return db;
}
