import { fallbackParse } from "./fallbackParser";
import { LLM_JSON_SCHEMA, LlmProtocolSchema, MAX_KEYTERMS, type LlmProtocol } from "./schema";

// Protocol text → structured protocol via the AssemblyAI LLM Gateway
// (brief §11.2). Server-only: needs the API key.
//
// Path: json_schema structured output + json-repair → if the model rejects
// response_format (NOTES.md C4: qwen3.5-4b-32k-fast does), retry once with
// the schema described in the prompt → zod → deterministic fallback parser.

export const GATEWAY_URL = "https://llm-gateway.assemblyai.com/v1/chat/completions";
const TIMEOUT_MS = 45_000;

const SYSTEM_PROMPT = `You convert laboratory protocol text into structured JSON. Preserve every quantity, unit, speed, temperature, and time exactly as written. Do not add, drop, merge, reorder, or reword steps. Split text into separate steps only where it clearly describes sequential actions or is already numbered. For each step, set duration_seconds only if the step states a single explicit duration; otherwise null. Extract up to 60 keyterms: reagent, buffer, kit, and equipment names and abbreviations a speech recognizer might mishear. Return only JSON matching the schema.`;

const SCHEMA_IN_PROMPT = `\n\nThe JSON must have exactly this shape:\n{"title": string, "steps": [{"text": string, "duration_seconds": integer or null, "reagents": [string]}], "keyterms": [string]}\nStep text must not include the step number. Return the JSON object only, with no commentary or code fences.`;

// Models that told us they don't support response_format; skip straight to
// the prompt-only request for them (per server instance).
const noSchemaModels = new Set<string>();

export type LlmParseOutcome = {
  data: LlmProtocol;
  source: "llm" | "fallback";
  note?: string;
  requestIds: string[];
};

type Deps = { apiKey: string; model: string; fetchImpl?: typeof fetch; log?: (msg: string) => void };

export async function parseProtocolText(text: string, deps: Deps): Promise<LlmParseOutcome> {
  const log = deps.log ?? ((m: string) => console.log(m));
  const requestIds: string[] = [];
  const fallback = (note: string): LlmParseOutcome => ({ data: fallbackParse(text), source: "fallback", note, requestIds });

  let useSchema = !noSchemaModels.has(deps.model);
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await callGateway(text, useSchema, deps, log);
    if (res.requestId) requestIds.push(res.requestId);
    if (res.kind === "schema_unsupported" && useSchema) {
      noSchemaModels.add(deps.model);
      useSchema = false;
      continue;
    }
    if (res.kind === "error") return fallback(res.message);
    if (res.kind === "schema_unsupported") return fallback("The model rejected the request.");

    const data = interpret(res.content);
    if (!data) return fallback("The model's response wasn't a usable protocol.");
    return { data, source: "llm", requestIds };
  }
  return fallback("The model couldn't be used.");
}

type GatewayResult =
  | { kind: "ok"; content: string; requestId?: string }
  | { kind: "schema_unsupported"; requestId?: string }
  | { kind: "error"; message: string; requestId?: string };

async function callGateway(text: string, useSchema: boolean, deps: Deps, log: (m: string) => void): Promise<GatewayResult> {
  const doFetch = deps.fetchImpl ?? fetch;
  const body: Record<string, unknown> = {
    model: deps.model,
    max_tokens: Math.min(12_000, Math.ceil(text.length / 2.5) + 1_500),
    messages: [
      { role: "system", content: useSchema ? SYSTEM_PROMPT : SYSTEM_PROMPT + SCHEMA_IN_PROMPT },
      { role: "user", content: text },
    ],
    post_processing_steps: [{ type: "json-repair" }],
  };
  if (useSchema) {
    body.response_format = {
      type: "json_schema",
      json_schema: { name: "lab_protocol", schema: LLM_JSON_SCHEMA, strict: true },
    };
  }

  const started = Date.now();
  let res: Response;
  try {
    res = await doFetch(GATEWAY_URL, {
      method: "POST",
      headers: { authorization: deps.apiKey, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (err) {
    const message = err instanceof Error && err.name === "TimeoutError" ? "The parser timed out." : "Couldn't reach the parser.";
    log(`[parse-protocol] gateway fetch failed model=${deps.model} schema=${useSchema}: ${String(err)}`);
    return { kind: "error", message };
  }

  const json = (await res.json().catch(() => null)) as GatewayBody | null;
  const requestId = typeof json?.request_id === "string" ? json.request_id : undefined;
  log(
    `[parse-protocol] gateway status=${res.status} request_id=${requestId ?? "-"} model=${deps.model} schema=${useSchema} ms=${Date.now() - started}`,
  );

  if (!res.ok) {
    const errors = [json?.message, ...(json?.metadata?.errors ?? [])].filter(Boolean).join("; ");
    if (useSchema && res.status === 400 && /response_format/i.test(errors)) return { kind: "schema_unsupported", requestId };
    log(`[parse-protocol] gateway error body: ${errors.slice(0, 300)}`);
    return { kind: "error", message: `The parser returned an error (${res.status}).`, requestId };
  }
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) return { kind: "error", message: "The parser returned an empty response.", requestId };
  return { kind: "ok", content, requestId };
}

type GatewayBody = {
  request_id?: unknown;
  message?: string;
  metadata?: { errors?: string[] };
  choices?: { message?: { content?: unknown } }[];
};

/** Extract and validate the protocol JSON from model output. */
export function interpret(content: string): LlmProtocol | null {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(content.slice(start, end + 1));
  } catch {
    return null;
  }
  const parsed = LlmProtocolSchema.safeParse(raw);
  if (!parsed.success) return null;
  const data = parsed.data;
  // Some models keep the list number in the text despite instructions.
  const steps = data.steps.map((s) => ({ ...s, text: s.text.replace(/^\s*(?:step\s*)?\d+[.):]\s+/i, "") }));
  return { ...data, steps, keyterms: mergeKeyterms(data.keyterms, steps.flatMap((s) => s.reagents)) };
}

export function mergeKeyterms(...lists: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const term of lists.flat()) {
    const t = term.trim();
    const k = t.toLowerCase();
    if (!t || seen.has(k)) continue;
    seen.add(k);
    out.push(t);
    if (out.length >= MAX_KEYTERMS) break;
  }
  return out;
}

/** Test hook. */
export function _resetSchemaCache(): void {
  noSchemaModels.clear();
}
