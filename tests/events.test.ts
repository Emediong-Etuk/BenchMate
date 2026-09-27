import { describe, expect, it } from "vitest";
import { parseServerEvent } from "@/lib/voice/events";

// Payloads copied from the Phase 0 probe logs (NOTES.md), trimmed.
const observed = {
  ready: `{"session_id":"sess_fe79","config":{"id":"sess_fe79"},"expires_at":1790465450,"resume_token":"eyJ","type":"session.ready","timestamp":1790461856.2594728}`,
  updated: `{"config":{"id":"x"},"type":"session.updated","timestamp":1790461856.24}`,
  agentDelta: `{"reply_id":"resp_154a","item_id":"msg_751e","delta":"fifty ","start_ms":1410,"end_ms":1687,"type":"transcript.agent.delta","timestamp":1790461859.12}`,
  agentFinal: `{"reply_id":"resp_154a","item_id":"msg_751e","text":"Step 2.","interrupted":false,"type":"transcript.agent","timestamp":1790461862.95}`,
  toolCall: `{"call_id":"chatcmpl-tool-8b12","name":"navigate_protocol","arguments":{"action":"current"},"type":"tool.call","timestamp":1790461858.33}`,
  replyDone: `{"reply_id":"resp_c3a4","status":"completed","type":"reply.done","timestamp":1790461858.6}`,
  ended: `{"session_duration_seconds":19.8,"type":"session.ended","timestamp":1790461875.75,"audio_duration_seconds":null}`,
  error: `{"code":"session_not_found","message":"Session not found or grace window has expired","session_id":null,"param":null,"type":"session.error","timestamp":1790461896.42}`,
};

describe("parseServerEvent", () => {
  it.each(Object.entries(observed))("parses observed %s payload", (_name, raw) => {
    const parsed = parseServerEvent(raw);
    expect(parsed.ok).toBe(true);
  });

  it("keeps tool.call arguments as an object", () => {
    const parsed = parseServerEvent(observed.toolCall);
    if (!parsed.ok || parsed.event.type !== "tool.call") throw new Error("expected tool.call");
    expect(parsed.event.arguments).toEqual({ action: "current" });
  });

  it("accepts an ISO-string timestamp as documented", () => {
    const parsed = parseServerEvent(`{"type":"session.error","code":"invalid_format","message":"x","timestamp":"2025-01-01T00:00:00Z"}`);
    expect(parsed.ok).toBe(true);
  });

  it("reads reply.audio from `data`", () => {
    const parsed = parseServerEvent(`{"type":"reply.audio","data":"AAA="}`);
    expect(parsed.ok && parsed.event.type === "reply.audio" && parsed.event.data).toBe("AAA=");
  });

  it("reports unknown types and bad JSON without throwing", () => {
    expect(parseServerEvent(`{"type":"something.new"}`)).toMatchObject({ ok: false, type: "something.new" });
    expect(parseServerEvent(`not json`)).toMatchObject({ ok: false, type: "invalid_json" });
  });
});
