import { describe, expect, it } from "vitest";
import { initialQueueState, reduceQueue, type QueueInput, type QueueState } from "@/lib/voice/toolResultQueue";

const r = (callId: string) => ({ callId, result: `{"ok":true}`, isError: false });

function run(inputs: QueueInput[], start: QueueState = initialQueueState) {
  let state = start;
  const sent: string[] = [];
  const dropped: string[] = [];
  for (const input of inputs) {
    const out = reduceQueue(state, input);
    state = out.state;
    sent.push(...out.send.map((s) => s.callId));
    dropped.push(...out.dropped.map((s) => s.callId));
  }
  return { state, sent, dropped };
}

describe("tool result queue (flushIfIdle)", () => {
  it("(a) tool.call during a reply is sent on reply.done(completed)", () => {
    const { sent, state } = run([
      { type: "reply.started" },
      { type: "result_ready", result: r("c1") },
      { type: "reply.done", status: "completed" },
    ]);
    expect(sent).toEqual(["c1"]);
    expect(state.pending).toEqual([]);
  });

  it("(b) handler finishing after reply.done sends immediately", () => {
    const { sent } = run([
      { type: "reply.started" },
      { type: "reply.done", status: "completed" },
      { type: "result_ready", result: r("c1") },
    ]);
    expect(sent).toEqual(["c1"]);
  });

  it("(c) user barge-in then interrupted reply drops the result", () => {
    const { sent, dropped } = run([
      { type: "reply.started" },
      { type: "result_ready", result: r("c1") },
      { type: "input.speech.started" },
      { type: "reply.done", status: "interrupted" },
    ]);
    expect(sent).toEqual([]);
    expect(dropped).toEqual(["c1"]);
  });

  it("holds results while the user is speaking after reply.done", () => {
    const { sent, state } = run([
      { type: "reply.done", status: "completed" },
      { type: "input.speech.started" },
      { type: "result_ready", result: r("c1") },
    ]);
    expect(sent).toEqual([]);
    expect(state.pending.map((p) => p.callId)).toEqual(["c1"]);
  });

  it("sends several results together, in order", () => {
    const { sent } = run([
      { type: "reply.started" },
      { type: "result_ready", result: r("c1") },
      { type: "result_ready", result: r("c2") },
      { type: "reply.done", status: "completed" },
    ]);
    expect(sent).toEqual(["c1", "c2"]);
  });

  it("does not send before any reply.done has been seen", () => {
    expect(run([{ type: "result_ready", result: r("c1") }]).sent).toEqual([]);
  });
});
