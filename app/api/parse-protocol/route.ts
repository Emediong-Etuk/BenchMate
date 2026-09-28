import { NextResponse } from "next/server";
import { buildParseResult } from "@/lib/protocol/buildProtocol";
import { fallbackParse } from "@/lib/protocol/fallbackParser";
import { runParsePipeline } from "@/lib/protocol/parsePipeline";
import { ParseRequestSchema, type LlmProtocol } from "@/lib/protocol/schema";
import { createRateLimiter } from "@/lib/server/rateLimit";
import { requireUser } from "@/lib/server/requireUser";

// POST { text, title?, source? } → ParseResult (brief §11.2).

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const limiter = createRateLimiter({ limit: 20, windowMs: 10 * 60 * 1000 });

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const a = await requireUser(request);
  if (!a.ok) return a.response;
  const limit = limiter.check(a.userId);
  if (!limit.ok) return json({ error: `Too many parse requests. Try again in ${Math.ceil(limit.retryAfterMs / 1000)} s.` }, 429);

  const body = await request.json().catch(() => null);
  const parsed = ParseRequestSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, 400);
  const { text, title } = parsed.data;
  const protocolSource = parsed.data.source ?? "pasted";

  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  const model = process.env.LLM_GATEWAY_MODEL || "claude-sonnet-4-6";
  const meta = { protocolSource, title, id: `p-${crypto.randomUUID()}`, now: new Date() };

  if (!apiKey) {
    console.error("[parse-protocol] ASSEMBLYAI_API_KEY is not set; using fallback parser");
    const data = fallbackParse(text);
    if (!data.steps.length) return json({ error: "No steps found in that text." }, 422);
    return json(buildParseResult(text, data, { ...meta, source: "fallback", note: "The AI parser isn't configured." }));
  }

  const debugMangle = process.env.BENCHMATE_DEBUG === "1" && request.headers.get("x-benchmate-debug") === "mangle";
  const result = await runParsePipeline(
    text,
    { apiKey, model, log: (m) => console.log(m), ...(debugMangle ? { transform: mangleForTesting } : {}) },
    meta,
  );
  if (!result.protocol.steps.length) return json({ error: "No steps found in that text. Try numbering the steps." }, 422);
  console.log(`[parse-protocol] done source=${result.source} model=${model} request_ids=${result.requestIds.join(",") || "-"}`);
  const { protocol, source, missingNumbers, note } = result;
  return json({ protocol, source, missingNumbers, ...(note ? { note } : {}) });
}

/**
 * Test hook (only with BENCHMATE_DEBUG=1): simulate a model that silently
 * drops a quantity, to exercise the missing-numbers warning end to end.
 */
function mangleForTesting(data: LlmProtocol): LlmProtocol {
  let done = false;
  const steps = data.steps.map((s) => {
    if (done) return s;
    const m = s.text.match(/\s*\b\d[\d,.]*\s*(?:x g|µL|mL|°C|minutes?|min|seconds?|s)\b/);
    if (!m) return s;
    done = true;
    return { ...s, text: s.text.replace(m[0], "") };
  });
  return { ...data, steps };
}
