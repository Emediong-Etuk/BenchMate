import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { getDb } from "@/lib/db";
import { benchSessions, userPrefs, users } from "@/lib/db/schema";

// Every read and write here takes the signed-in user's id from the server
// session and filters on it. A session id alone never reaches another user's
// row: reads and deletes match (id, user_id), and an upsert of an id owned by
// someone else changes nothing.

type Db = ReturnType<typeof getDb>;

export const MAX_SESSION_BYTES = 2_000_000;
export const MAX_PREFS_BYTES = 1_000_000;
/** Full sessions sent with the initial state; older ones load on demand. */
export const RECENT_FULL_SESSIONS = 30;

/** Minimal structural check: enough to keep junk out, loose enough to keep old sessions loading. */
export const SessionPayloadSchema = z
  .object({
    id: z.string().min(1).max(100),
    protocol: z.object({ title: z.string().max(500), steps: z.array(z.unknown()).max(500) }).passthrough(),
    startedAt: z.string().datetime({ offset: true }),
    endedAt: z.string().datetime({ offset: true }).optional(),
    entries: z.array(z.object({ status: z.string() }).passthrough()),
  })
  .passthrough();

export type SessionPayload = z.infer<typeof SessionPayloadSchema>;

export const PrefsPayloadSchema = z.object({
  settings: z.record(z.string(), z.unknown()).optional(),
  researcherName: z.string().max(200).optional(),
  draft: z.unknown().optional(),
  activeSessionId: z.string().max(100).nullable().optional(),
});

export type SessionSummary = { id: string; title: string; startedAt: string; endedAt: string | null; entryCount: number };

export async function loadState(db: Db, userId: string) {
  const [prefsRow] = await db.select({ data: userPrefs.data }).from(userPrefs).where(eq(userPrefs.userId, userId));
  const rows = await db
    .select({ data: benchSessions.data })
    .from(benchSessions)
    .where(eq(benchSessions.userId, userId))
    .orderBy(desc(benchSessions.startedAt))
    .limit(RECENT_FULL_SESSIONS);
  return { prefs: (prefsRow?.data ?? null) as Record<string, unknown> | null, sessions: rows.map((r) => r.data) };
}

export async function listSessions(db: Db, userId: string, limit = 500): Promise<SessionSummary[]> {
  const rows = await db
    .select({
      id: benchSessions.id,
      title: benchSessions.title,
      startedAt: benchSessions.startedAt,
      endedAt: benchSessions.endedAt,
      entryCount: benchSessions.entryCount,
    })
    .from(benchSessions)
    .where(eq(benchSessions.userId, userId))
    .orderBy(desc(benchSessions.startedAt))
    .limit(limit);
  return rows.map((r) => ({ ...r, startedAt: r.startedAt.toISOString(), endedAt: r.endedAt?.toISOString() ?? null }));
}

export async function getSession(db: Db, userId: string, id: string): Promise<unknown | null> {
  const [row] = await db
    .select({ data: benchSessions.data })
    .from(benchSessions)
    .where(and(eq(benchSessions.id, id), eq(benchSessions.userId, userId)));
  return row?.data ?? null;
}

/** Insert or update; returns false when the id belongs to another user (nothing is written). */
export async function saveSession(db: Db, userId: string, s: SessionPayload): Promise<boolean> {
  const values = {
    id: s.id,
    userId,
    title: s.protocol.title || "Untitled protocol",
    startedAt: new Date(s.startedAt),
    endedAt: s.endedAt ? new Date(s.endedAt) : null,
    entryCount: s.entries.filter((e) => e.status !== "voided").length,
    data: s,
    updatedAt: new Date(),
  };
  const out = await db
    .insert(benchSessions)
    .values(values)
    .onConflictDoUpdate({
      target: benchSessions.id,
      set: {
        title: values.title,
        startedAt: values.startedAt,
        endedAt: values.endedAt,
        entryCount: values.entryCount,
        data: values.data,
        updatedAt: values.updatedAt,
      },
      // Only the owner's row may be updated.
      setWhere: eq(benchSessions.userId, userId),
    })
    .returning({ id: benchSessions.id });
  return out.length > 0;
}

export async function deleteSession(db: Db, userId: string, id: string): Promise<boolean> {
  const out = await db
    .delete(benchSessions)
    .where(and(eq(benchSessions.id, id), eq(benchSessions.userId, userId)))
    .returning({ id: benchSessions.id });
  return out.length > 0;
}

export async function savePrefs(db: Db, userId: string, data: z.infer<typeof PrefsPayloadSchema>): Promise<void> {
  const now = new Date();
  await db
    .insert(userPrefs)
    .values({ userId, data, updatedAt: now })
    .onConflictDoUpdate({ target: userPrefs.userId, set: { data, updatedAt: now } });
}

export async function accountStats(db: Db, userId: string) {
  const [row] = await db
    .select({
      sessions: sql<number>`count(*)::int`,
      finished: sql<number>`count(${benchSessions.endedAt})::int`,
      entries: sql<number>`coalesce(sum(${benchSessions.entryCount}), 0)::int`,
      seconds: sql<number>`coalesce(sum(extract(epoch from (${benchSessions.endedAt} - ${benchSessions.startedAt}))), 0)::int`,
    })
    .from(benchSessions)
    .where(eq(benchSessions.userId, userId));
  return row ?? { sessions: 0, finished: 0, entries: 0, seconds: 0 };
}

/** Deletes the user; their linked accounts, sessions and prefs go with them (ON DELETE CASCADE). */
export async function deleteAccount(db: Db, userId: string): Promise<void> {
  await db.delete(users).where(eq(users.id, userId));
}
