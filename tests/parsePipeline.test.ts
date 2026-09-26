import { beforeEach, describe, expect, it, vi } from "vitest";
import { _resetSchemaCache } from "@/lib/protocol/llmParse";
import { runParsePipeline } from "@/lib/protocol/parsePipeline";
import type { LlmProtocol } from "@/lib/protocol/schema";

const TEXT = "Gel\n1. Weigh 1 g agarose.\n2. Set for 30 minutes.\n3. Run at 120 V for 40 minutes.";
const full = {
  title: "Gel",
  steps: [
    { text: "Weigh 1 g agarose.", duration_seconds: null, reagents: ["agarose"] },
    { text: "Set for 30 minutes.", duration_seconds: 1800, reagents: [] },
    { text: "Run at 120 V for 40 minutes.", duration_seconds: 2400, reagents: [] },
  ],
  keyterms: ["agarose"],
};
const truncated = { ...full, steps: full.steps.slice(0, 2) };

const ok = (data: unknown) =>
  new Response(JSON.stringify({ request_id: "r", choices: [{ message: { content: JSON.stringify(data) } }] }), { status: 200 });
const meta = { protocolSource: "pasted" as const, id: "p", now: new Date(0) };
const deps = (fetchImpl: unknown) => ({ apiKey: "k", model: "m", fetchImpl: fetchImpl as typeof fetch });

beforeEach(() => _resetSchemaCache());

describe("runParsePipeline", () => {
  it("returns a clean LLM parse directly", async () => {
    const f = vi.fn(async () => ok(full));
    const r = await runParsePipeline(TEXT, deps(f), meta);
    expect(r.source).toBe("llm");
    expect(r.missingNumbers).toEqual([]);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("retries once when the LLM drops a step, keeping the complete retry", async () => {
    const f = vi.fn().mockResolvedValueOnce(ok(truncated)).mockResolvedValueOnce(ok(full));
    const r = await runParsePipeline(TEXT, deps(f), meta);
    expect(r.source).toBe("llm");
    expect(r.protocol.steps).toHaveLength(3);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("rescues with the rule-based split (keeping AI keyterms) when both LLM tries drop content", async () => {
    const f = vi.fn(async () => ok(truncated));
    const r = await runParsePipeline(TEXT, deps(f), meta);
    expect(r.source).toBe("fallback");
    expect(r.protocol.steps).toHaveLength(3);
    expect(r.protocol.keyterms).toEqual(["agarose"]);
    expect(r.missingNumbers).toEqual([]);
    expect(r.note).toMatch(/rule-based/);
  });

  it("still reports missing numbers when every candidate loses them (test transform)", async () => {
    const f = vi.fn(async () => ok(full));
    const drop120 = (d: LlmProtocol): LlmProtocol => ({ ...d, steps: d.steps.map((s) => ({ ...s, text: s.text.replace("120 V ", "") })) });
    const r = await runParsePipeline(TEXT, { ...deps(f), transform: drop120 }, meta);
    expect(r.missingNumbers).toEqual(["120"]);
  });
});
