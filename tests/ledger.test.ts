import { describe, expect, it } from "vitest";
import { applyCall, canonicalKey, emptyLedger, markDropped, markSent, newTurn, type LedgerState } from "@/lib/agent/ledger";
import { initialQueueState, reduceQueue, type QueueInput, type QueueState } from "@/lib/voice/toolResultQueue";
import type { BenchSession } from "@/lib/store/types";
import { makeSession } from "./fixtures/session";

// Drives the real queue reducer + ledger together through the event
// sequences in brief §10.3, the way VoiceClient does.
class Harness {
  session: BenchSession = { ...makeSession(), currentStep: 2, stepEvents: [{ stepNumber: 2, startedAt: "x" }] };
  ledger: LedgerState = emptyLedger;
  queue: QueueState = initialQueueState;
  sent: string[] = [];
  t = Date.parse("2026-09-26T10:00:00Z");

  private feed(input: QueueInput) {
    const out = reduceQueue(this.queue, input);
    this.queue = out.state;
    for (const r of out.send) {
      this.sent.push(r.callId);
      ({ session: this.session, ledger: this.ledger } = markSent(this.session, this.ledger, r.callId));
    }
    if (out.dropped.length) {
      ({ session: this.session, ledger: this.ledger } = markDropped(this.session, this.ledger, out.dropped.map((d) => d.callId), this.t));
    }
  }
  event(type: "reply.started" | "input.speech.started") {
    this.feed({ type });
  }
  done(status: "completed" | "interrupted") {
    this.feed({ type: "reply.done", status });
  }
  /** tool.call arrives; the handler may "finish" later via ready(). */
  call(callId: string, name: string, args: Record<string, unknown>, { deferResult = false } = {}) {
    this.t += 1000;
    const out = applyCall(this.session, this.ledger, { callId, name, args }, { now: new Date(this.t), callId, lastUserUtterance: "u" });
    this.session = out.session;
    this.ledger = out.ledger;
    const ready = () => this.feed({ type: "result_ready", result: { callId, result: JSON.stringify(out.result), isError: out.isError } });
    if (!deferResult) ready();
    return { out, ready };
  }
  userTurn() {
    this.ledger = newTurn(this.ledger);
  }
  statuses() {
    return this.session.entries.map((e) => e.status);
  }
}

const deviation = { description: "Spun for 3 minutes instead of 1." };

describe("commit semantics (brief §10.3)", () => {
  it("(a) tool.call → reply.done(completed): entry confirmed", () => {
    const h = new Harness();
    h.event("reply.started");
    h.call("c1", "log_deviation", deviation);
    expect(h.statuses()).toEqual(["pending"]);
    h.done("completed");
    expect(h.sent).toEqual(["c1"]);
    expect(h.statuses()).toEqual(["confirmed"]);
  });

  it("(b) reply.done arrives before the handler finishes: sent on completion, confirmed", () => {
    const h = new Harness();
    h.event("reply.started");
    const { ready } = h.call("c1", "log_deviation", deviation, { deferResult: true });
    h.done("completed");
    expect(h.sent).toEqual([]);
    ready();
    expect(h.sent).toEqual(["c1"]);
    expect(h.statuses()).toEqual(["confirmed"]);
  });

  it("(c) tool.call → input.speech.started → reply.done(interrupted): unconfirmed, not sent", () => {
    const h = new Harness();
    h.event("reply.started");
    h.call("c1", "log_deviation", deviation);
    h.event("input.speech.started");
    h.done("interrupted");
    expect(h.sent).toEqual([]);
    expect(h.statuses()).toEqual(["unconfirmed"]);
    expect(h.ledger.dropped).toHaveLength(1);
  });

  it("(d) interrupted then identical re-call: reuses the entry (no duplicate) and confirms it", () => {
    const h = new Harness();
    h.event("reply.started");
    h.call("c1", "log_deviation", deviation);
    h.event("input.speech.started");
    h.done("interrupted");
    h.event("reply.started");
    const { out } = h.call("c2", "log_deviation", { description: "  spun for 3 minutes instead of 1. " });
    expect(out.replayed).toBe(true);
    h.done("completed");
    expect(h.session.entries).toHaveLength(1);
    expect(h.statuses()).toEqual(["confirmed"]);
    expect(h.sent).toEqual(["c2"]);
  });

  it("never dedupes against confirmed entries from an earlier turn (a repeated reading may be real)", () => {
    const h = new Harness();
    const args = { measurements: [{ sample_id: "1", quantity: "concentration", value: 245, unit: "ng/µL" }] };
    h.userTurn();
    h.event("reply.started");
    h.call("c1", "record_measurement", args);
    h.done("completed");
    h.userTurn();
    h.event("reply.started");
    const { out } = h.call("c2", "record_measurement", args);
    h.done("completed");
    expect(out.replayed).toBe(false);
    expect(h.statuses()).toEqual(["confirmed", "confirmed"]);
  });

  it("collapses identical calls repeated within one turn (model loop)", () => {
    const h = new Harness();
    const args = { measurements: [{ sample_id: "2", quantity: "concentration", value: 245, unit: "nanograms per microliter" }] };
    h.userTurn();
    h.event("reply.started");
    h.call("c1", "record_measurement", args);
    h.done("completed");
    h.event("reply.started");
    const { out } = h.call("c2", "record_measurement", args);
    h.done("completed");
    expect(out.replayed).toBe(true);
    expect(h.session.entries).toHaveLength(1);
    expect(h.sent).toEqual(["c1", "c2"]);
    // A 'next' repeated in the same turn doesn't skip a step either.
    h.event("reply.started");
    h.call("c3", "navigate_protocol", { action: "next" });
    h.done("completed");
    h.event("reply.started");
    h.call("c4", "navigate_protocol", { action: "next" });
    h.done("completed");
    expect(h.session.currentStep).toBe(3);
  });

  it("an interrupted 'next' re-said right away doesn't advance twice", () => {
    const h = new Harness();
    h.event("reply.started");
    h.call("c1", "navigate_protocol", { action: "next" });
    h.event("input.speech.started");
    h.done("interrupted");
    expect(h.session.currentStep).toBe(3);
    h.event("reply.started");
    const { out } = h.call("c2", "navigate_protocol", { action: "next" });
    h.done("completed");
    expect(out.replayed).toBe(true);
    expect(out.result.step_number).toBe(3);
    expect(h.session.currentStep).toBe(3);
  });

  it("a dropped 'next' is not replayed once another call has run", () => {
    const h = new Harness();
    h.event("reply.started");
    h.call("c1", "navigate_protocol", { action: "next" });
    h.event("input.speech.started");
    h.done("interrupted");
    h.event("reply.started");
    h.call("c2", "navigate_protocol", { action: "previous" });
    h.done("completed");
    h.event("reply.started");
    const { out } = h.call("c3", "navigate_protocol", { action: "next" });
    expect(out.replayed).toBe(false);
    expect(h.session.currentStep).toBe(3);
  });

  it("dedup expires after 60 s", () => {
    const h = new Harness();
    h.event("reply.started");
    h.call("c1", "log_observation", { text: "cloudy" });
    h.event("input.speech.started");
    h.done("interrupted");
    h.t += 61_000;
    h.event("reply.started");
    const { out } = h.call("c2", "log_observation", { text: "cloudy" });
    expect(out.replayed).toBe(false);
    expect(h.session.entries).toHaveLength(2);
  });

  it("a replayed finish_session still requests finish", () => {
    const h = new Harness();
    h.event("reply.started");
    h.call("c1", "finish_session", {});
    h.event("input.speech.started");
    h.done("interrupted");
    const { out } = h.call("c2", "finish_session", {});
    expect(out.replayed).toBe(true);
    expect(out.effects).toEqual({ finish: true });
  });
});

describe("canonicalKey", () => {
  it("ignores key order, case, whitespace, and unit spelling", () => {
    const a = canonicalKey("record_measurement", { measurements: [{ unit: "ng/ul", value: 245, quantity: "Concentration", sample_id: "2" }] });
    const b = canonicalKey("record_measurement", { measurements: [{ sample_id: "2", quantity: "concentration", value: 245, unit: "nanograms per microliter" }] });
    expect(a).toBe(b);
    expect(canonicalKey("record_measurement", { measurements: [{ value: 254 }] })).not.toBe(canonicalKey("record_measurement", { measurements: [{ value: 245 }] }));
  });
});
