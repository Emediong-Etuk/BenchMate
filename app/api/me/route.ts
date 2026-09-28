import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { json, requireUser } from "@/lib/server/requireUser";
import { accountStats, deleteAccount, loadState } from "@/lib/server/userData";

// GET: the signed-in user's profile, preferences, recent sessions and totals.
// DELETE: permanently deletes the account and everything in it.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const a = await requireUser(request, { needsDb: true });
  if (!a.ok) return a.response;
  const session = await auth();
  const db = getDb();
  const [state, stats] = await Promise.all([loadState(db, a.userId), accountStats(db, a.userId)]);
  const u = session?.user;
  return json({ user: { id: a.userId, name: u?.name ?? null, email: u?.email ?? null, image: u?.image ?? null }, ...state, stats });
}

export async function DELETE(request: Request) {
  const a = await requireUser(request, { needsDb: true });
  if (!a.ok) return a.response;
  await deleteAccount(getDb(), a.userId);
  console.log("[account] deleted a user account");
  return json({ ok: true });
}
