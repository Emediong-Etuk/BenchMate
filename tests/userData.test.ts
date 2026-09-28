import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";
import {
  accountStats,
  deleteAccount,
  deleteSession,
  getSession,
  listSessions,
  loadState,
  savePrefs,
  saveSession,
  SessionPayloadSchema,
  type SessionPayload,
} from "@/lib/server/userData";

// Privacy tests against a real Postgres. Set TEST_DATABASE_URL to a throwaway
// database to run them (they create and delete their own users).
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("per-user data isolation (Postgres)", () => {
  const client = url ? postgres(url, { prepare: false, max: 2, onnotice: () => {} }) : null;
  const db = client ? drizzle(client, { schema }) : (null as never);
  const alice = `test-alice-${crypto.randomUUID()}`;
  const bob = `test-bob-${crypto.randomUUID()}`;

  const session = (id: string, title = "Mini protocol"): SessionPayload =>
    SessionPayloadSchema.parse({
      id,
      protocol: { title, steps: [{ number: 1, text: "Step" }] },
      startedAt: "2026-09-26T10:00:00.000Z",
      entries: [{ status: "confirmed" }, { status: "voided" }],
    });

  beforeAll(async () => {
    await migrate(db, { migrationsFolder: "./drizzle" });
    await db.insert(schema.users).values([
      { id: alice, email: `${alice}@example.test`, name: "Alice" },
      { id: bob, email: `${bob}@example.test`, name: "Bob" },
    ]);
  });

  afterAll(async () => {
    await deleteAccount(db, alice);
    await deleteAccount(db, bob);
    await client?.end();
  });

  it("saves and reads back a user's own session", async () => {
    expect(await saveSession(db, alice, session("s-alice-1"))).toBe(true);
    const got = (await getSession(db, alice, "s-alice-1")) as { id: string } | null;
    expect(got?.id).toBe("s-alice-1");
    const list = await listSessions(db, alice);
    expect(list.map((s) => s.id)).toEqual(["s-alice-1"]);
    expect(list[0]!.entryCount).toBe(1); // voided entries don't count
  });

  it("never shows one user's sessions to another", async () => {
    expect(await getSession(db, bob, "s-alice-1")).toBeNull();
    expect(await listSessions(db, bob)).toEqual([]);
    expect((await loadState(db, bob)).sessions).toEqual([]);
  });

  it("refuses to overwrite another user's session id", async () => {
    expect(await saveSession(db, bob, session("s-alice-1", "Hijacked"))).toBe(false);
    const got = (await getSession(db, alice, "s-alice-1")) as { protocol: { title: string } };
    expect(got.protocol.title).toBe("Mini protocol");
  });

  it("refuses to delete another user's session", async () => {
    expect(await deleteSession(db, bob, "s-alice-1")).toBe(false);
    expect(await getSession(db, alice, "s-alice-1")).not.toBeNull();
  });

  it("keeps preferences per user", async () => {
    await savePrefs(db, alice, { researcherName: "Alice A." });
    await savePrefs(db, bob, { researcherName: "Bob B." });
    expect((await loadState(db, alice)).prefs).toMatchObject({ researcherName: "Alice A." });
    expect((await loadState(db, bob)).prefs).toMatchObject({ researcherName: "Bob B." });
  });

  it("counts only the user's own activity", async () => {
    await saveSession(db, bob, session("s-bob-1"));
    expect((await accountStats(db, alice)).sessions).toBe(1);
    expect((await accountStats(db, bob)).sessions).toBe(1);
  });

  it("deleting an account removes all of its data and nothing else", async () => {
    const carol = `test-carol-${crypto.randomUUID()}`;
    await db.insert(schema.users).values({ id: carol, email: `${carol}@example.test` });
    await saveSession(db, carol, session("s-carol-1"));
    await savePrefs(db, carol, { researcherName: "Carol" });
    await deleteAccount(db, carol);
    expect(await getSession(db, carol, "s-carol-1")).toBeNull();
    expect((await loadState(db, carol)).prefs).toBeNull();
    expect(await getSession(db, alice, "s-alice-1")).not.toBeNull();
  });
});
