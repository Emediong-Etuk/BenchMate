import { getDb } from "@/lib/db";
import { json, readJson, requireUser } from "@/lib/server/requireUser";
import { deleteSession, getSession, MAX_SESSION_BYTES, saveSession, SessionPayloadSchema } from "@/lib/server/userData";

// One bench session, scoped to the signed-in user. Another user's id answers
// 404, exactly like a missing one.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Ctx) {
  const a = await requireUser(request, { needsDb: true });
  if (!a.ok) return a.response;
  const { id } = await params;
  const data = await getSession(getDb(), a.userId, id);
  return data ? json({ session: data }) : json({ error: "Session not found." }, 404);
}

export async function PUT(request: Request, { params }: Ctx) {
  const a = await requireUser(request, { needsDb: true });
  if (!a.ok) return a.response;
  const { id } = await params;
  const body = await readJson(request, MAX_SESSION_BYTES);
  if (!body.ok) return body.response;
  const parsed = SessionPayloadSchema.safeParse(body.value);
  if (!parsed.success || parsed.data.id !== id) return json({ error: "Invalid session." }, 400);
  const saved = await saveSession(getDb(), a.userId, parsed.data);
  return saved ? json({ ok: true }) : json({ error: "Session not found." }, 404);
}

export async function DELETE(request: Request, { params }: Ctx) {
  const a = await requireUser(request, { needsDb: true });
  if (!a.ok) return a.response;
  const { id } = await params;
  await deleteSession(getDb(), a.userId, id);
  return json({ ok: true });
}
