import { getDb } from "@/lib/db";
import { json, requireUser } from "@/lib/server/requireUser";
import { listSessions } from "@/lib/server/userData";

// GET: summaries of all of the signed-in user's sessions, newest first.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const a = await requireUser(request, { needsDb: true });
  if (!a.ok) return a.response;
  return json({ sessions: await listSessions(getDb(), a.userId) });
}
