import { getDb } from "@/lib/db";
import { json, readJson, requireUser } from "@/lib/server/requireUser";
import { MAX_PREFS_BYTES, PrefsPayloadSchema, savePrefs } from "@/lib/server/userData";

// PUT: settings, protocol draft, researcher name and active session id.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PUT(request: Request) {
  const a = await requireUser(request, { needsDb: true });
  if (!a.ok) return a.response;
  const body = await readJson(request, MAX_PREFS_BYTES);
  if (!body.ok) return body.response;
  const parsed = PrefsPayloadSchema.safeParse(body.value);
  if (!parsed.success) return json({ error: "Invalid preferences." }, 400);
  await savePrefs(getDb(), a.userId, parsed.data);
  return json({ ok: true });
}
