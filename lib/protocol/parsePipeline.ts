import { buildParseResult } from "./buildProtocol";
import { fallbackParse } from "./fallbackParser";
import { parseProtocolText } from "./llmParse";
import type { LlmProtocol } from "./schema";
import type { ParseResult, ProtocolSource } from "./types";

// Full parse pipeline with the number check as a quality gate.
//
// Small models sometimes drop whole steps (observed with qwen3.5-4b: the last
// two steps of a six-step protocol vanished). So:
//   1. LLM parse → if no quantities were lost, done.
//   2. Otherwise retry once and keep the better of the two.
//   3. If that still lost quantities and the deterministic split lost fewer,
//      use the deterministic steps but keep the LLM's keyterms.
// Whatever wins, its missingNumbers are shown on the setup screen.

type Deps = {
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
  log?: (msg: string) => void;
  /** Test hook applied to every candidate (see BENCHMATE_DEBUG in the route). */
  transform?: (d: LlmProtocol) => LlmProtocol;
};

type Meta = { protocolSource: ProtocolSource; title?: string; id: string; now: Date };

export async function runParsePipeline(text: string, deps: Deps, meta: Meta): Promise<ParseResult & { requestIds: string[] }> {
  const log = deps.log ?? (() => undefined);
  const tf = deps.transform ?? ((d: LlmProtocol) => d);
  const requestIds: string[] = [];

  const attempt = async () => {
    const out = await parseProtocolText(text, deps);
    requestIds.push(...out.requestIds);
    return { out, result: buildParseResult(text, tf(out.data), { ...meta, source: out.source, note: out.note }, log) };
  };

  let best = await attempt();
  if (best.out.source === "fallback" || best.result.missingNumbers.length === 0) return { ...best.result, requestIds };

  log(`[parse-protocol] LLM parse lost ${best.result.missingNumbers.join(", ")}; retrying once`);
  const second = await attempt();
  if (second.out.source === "llm" && second.result.missingNumbers.length < best.result.missingNumbers.length) best = second;
  if (best.result.missingNumbers.length === 0) return { ...best.result, requestIds };

  const rescue = buildParseResult(
    text,
    tf({ ...fallbackParse(text), keyterms: best.out.data.keyterms }),
    {
      ...meta,
      source: "fallback",
      note: "The AI parser dropped some values, so BenchMate used the rule-based split and kept the AI's keyterms.",
    },
    log,
  );
  if (rescue.missingNumbers.length < best.result.missingNumbers.length && rescue.protocol.steps.length > 0) {
    log(`[parse-protocol] using rule-based split (lost ${rescue.missingNumbers.length} vs ${best.result.missingNumbers.length})`);
    return { ...rescue, requestIds };
  }
  return { ...best.result, requestIds };
}
