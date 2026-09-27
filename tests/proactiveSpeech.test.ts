import { describe, expect, it } from "vitest";
import {
  AWAIT_TIMEOUT_MS,
  SPEECH_SETTLE_MS,
  decide,
  initialProactive,
  reduceProactive,
  type ProactiveEvent,
  type ProactiveState,
} from "@/lib/voice/proactiveSpeech";

function feed(events: ProactiveEvent[], start: ProactiveState = initialProactive) {
  let state = start;
  const announced: string[] = [];
  for (const e of events) {
    const out = reduceProactive(state, e);
    state = out.state;
    if (out.announced) announced.push(out.announced);
  }
  return { state, announced };
}

const pending = ["t1"];

describe("proactive speech", () => {
  it("does nothing before session.ready", () => {
    expect(decide(initialProactive, { now: 0, pending, pendingToolResults: 0 }).send).toBeNull();
  });

  it("fires right after session.ready when nothing has happened yet", () => {
    const { state } = feed([{ type: "session.ready" }]);
    expect(decide(state, { now: 0, pending, pendingToolResults: 0 }).send).toBe("t1");
  });

  it("waits while the agent is speaking, fires after reply.done", () => {
    let { state } = feed([{ type: "session.ready" }, { type: "reply.started" }]);
    expect(decide(state, { now: 0, pending, pendingToolResults: 0 }).send).toBeNull();
    state = reduceProactive(state, { type: "reply.done" }).state;
    expect(decide(state, { now: 0, pending, pendingToolResults: 0 }).send).toBe("t1");
  });

  it("waits while tool results are pending", () => {
    const { state } = feed([{ type: "session.ready" }, { type: "reply.started" }, { type: "reply.done" }]);
    expect(decide(state, { now: 0, pending, pendingToolResults: 1 }).send).toBeNull();
    expect(decide(state, { now: 0, pending, pendingToolResults: 0 }).send).toBe("t1");
  });

  it("never talks over the user; waits 800 ms after they stop", () => {
    let { state } = feed([{ type: "session.ready" }, { type: "input.speech.started" }]);
    expect(decide(state, { now: 1000, pending, pendingToolResults: 0 }).send).toBeNull();
    state = reduceProactive(state, { type: "input.speech.stopped", now: 2000 }).state;
    expect(decide(state, { now: 2000 + SPEECH_SETTLE_MS - 1, pending, pendingToolResults: 0 }).send).toBeNull();
    expect(decide(state, { now: 2000 + SPEECH_SETTLE_MS, pending, pendingToolResults: 0 }).send).toBe("t1");
  });

  it("if the agent starts answering the user, waits for that reply to finish", () => {
    let { state } = feed([
      { type: "session.ready" },
      { type: "input.speech.started" },
      { type: "input.speech.stopped", now: 2000 },
      { type: "reply.started" },
    ]);
    expect(decide(state, { now: 9000, pending, pendingToolResults: 0 }).send).toBeNull();
    state = reduceProactive(state, { type: "reply.done" }).state;
    expect(decide(state, { now: 9000, pending, pendingToolResults: 0 }).send).toBe("t1");
  });

  it("marks announced when reply.started follows our reply.create, one at a time", () => {
    const { state } = feed([{ type: "session.ready" }, { type: "sent", timerId: "t1", now: 0 }]);
    expect(decide(state, { now: 100, pending: ["t1", "t2"], pendingToolResults: 0 }).send).toBeNull();
    const out = reduceProactive(state, { type: "reply.started" });
    expect(out.announced).toBe("t1");
    const done = reduceProactive(out.state, { type: "reply.done" }).state;
    expect(decide(done, { now: 200, pending: ["t2"], pendingToolResults: 0 }).send).toBe("t2");
  });

  it("retries if no reply.started arrives in time", () => {
    const { state } = feed([{ type: "session.ready" }, { type: "sent", timerId: "t1", now: 0 }]);
    expect(decide(state, { now: AWAIT_TIMEOUT_MS - 1, pending, pendingToolResults: 0 }).send).toBeNull();
    expect(decide(state, { now: AWAIT_TIMEOUT_MS, pending, pendingToolResults: 0 }).send).toBe("t1");
  });

  it("holds while finishing, and resets on disconnect", () => {
    const { state } = feed([{ type: "session.ready" }]);
    expect(decide(state, { now: 0, pending, pendingToolResults: 0, hold: true }).send).toBeNull();
    const off = reduceProactive(state, { type: "disconnected" }).state;
    expect(decide(off, { now: 0, pending, pendingToolResults: 0 }).send).toBeNull();
  });
});
