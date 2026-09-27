import { beforeEach, describe, expect, it, vi } from "vitest";
import { _resetSchemaCache, interpret, parseProtocolText } from "@/lib/protocol/llmParse";

const TEXT = "Quick spin\n1. Add 250 µL Buffer P1.\n2. Centrifuge 1 min at 13,000 x g.";
const GOOD = JSON.stringify({
  title: "Quick spin",
  steps: [
    { text: "Add 250 µL Buffer P1.", duration_seconds: null, reagents: ["Buffer P1"] },
    { text: "Centrifuge 1 min at 13,000 x g.", duration_seconds: 60, reagents: [] },
  ],
  keyterms: ["Buffer P1", "centrifuge"],
});

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
const ok = (content: string) => reply(200, { request_id: "req-ok", choices: [{ message: { content } }] });

beforeEach(() => _resetSchemaCache());

const deps = (fetchImpl: typeof fetch) => ({ apiKey: "k", model: "m", fetchImpl, log: () => undefined });

describe("parseProtocolText", () => {
  it("uses structured output when the model supports it", async () => {
    const fetchImpl = vi.fn(async () => ok(GOOD));
    const out = await parseProtocolText(TEXT, deps(fetchImpl as unknown as typeof fetch));
    expect(out.source).toBe("llm");
    expect(out.data.steps).toHaveLength(2);
    expect(out.requestIds).toEqual(["req-ok"]);
    const body = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.response_format.type).toBe("json_schema");
    expect(body.post_processing_steps).toEqual([{ type: "json-repair" }]);
  });

  it("retries without response_format when the model rejects it, and remembers", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        reply(400, { request_id: "req-400", message: "invalid request body", metadata: { errors: ["model m does not support response_format"] } }),
      )
      .mockResolvedValueOnce(ok("\n```json\n" + GOOD + "\n```"))
      .mockResolvedValueOnce(ok(GOOD));
    const out = await parseProtocolText(TEXT, deps(fetchImpl as unknown as typeof fetch));
    expect(out.source).toBe("llm");
    expect(out.requestIds).toEqual(["req-400", "req-ok"]);
    const second = JSON.parse(fetchImpl.mock.calls[1]![1].body);
    expect(second.response_format).toBeUndefined();
    expect(second.messages[0].content).toContain("exactly this shape");

    await parseProtocolText(TEXT, deps(fetchImpl as unknown as typeof fetch));
    expect(fetchImpl).toHaveBeenCalledTimes(3); // skipped the schema attempt the second time
  });

  it("falls back on a gateway error", async () => {
    const fetchImpl = vi.fn(async () => reply(500, { request_id: "r", message: "boom" }));
    const out = await parseProtocolText(TEXT, deps(fetchImpl as unknown as typeof fetch));
    expect(out.source).toBe("fallback");
    expect(out.data.steps.map((s) => s.text)).toEqual(["Add 250 µL Buffer P1.", "Centrifuge 1 min at 13,000 x g."]);
    expect(out.note).toMatch(/500/);
  });

  it("falls back on junk output and on network failure", async () => {
    const junk = await parseProtocolText(TEXT, deps((async () => ok("Sure! Here are the steps...")) as unknown as typeof fetch));
    expect(junk.source).toBe("fallback");
    const down = await parseProtocolText(
      TEXT,
      deps((async () => {
        throw new TypeError("fetch failed");
      }) as unknown as typeof fetch),
    );
    expect(down.source).toBe("fallback");
  });
});

describe("interpret", () => {
  it("strips leftover step numbers and merges reagents into keyterms", () => {
    const data = interpret(
      JSON.stringify({ title: "T", steps: [{ text: "1. Add buffer AL.", duration_seconds: null, reagents: ["Buffer AL"] }], keyterms: ["buffer al", "Qubit"] }),
    );
    expect(data?.steps[0]!.text).toBe("Add buffer AL.");
    expect(data?.keyterms).toEqual(["buffer al", "Qubit"]);
  });

  it("rejects empty step lists", () => {
    expect(interpret(`{"title":"x","steps":[],"keyterms":[]}`)).toBeNull();
  });
});
