import { describe, expect, it } from "vitest";
import { reduceFinish, type FinishEvent, type FinishState } from "@/lib/bench/finishFlow";

function run(events: FinishEvent[]) {
  let state: FinishState = "idle";
  const fired: number[] = [];
  events.forEach((e, i) => {
    const out = reduceFinish(state, e);
    state = out.state;
    if (out.finishNow) fired.push(i);
  });
  return { state, fired };
}

describe("reduceFinish", () => {
  it("ignores the reply.done that flushed the result, finishes after the closing reply", () => {
    expect(run(["finish_result_sent", "reply.done", "reply.started", "reply.done"]).fired).toEqual([3]);
  });
  it("finishes on timeout if the agent never replies", () => {
    expect(run(["finish_result_sent", "reply.done", "timeout"]).fired).toEqual([2]);
  });
  it("does nothing unless armed", () => {
    expect(run(["reply.started", "reply.done", "timeout"]).fired).toEqual([]);
  });
  it("a timeout while the closing reply is playing doesn't cut it off", () => {
    expect(run(["finish_result_sent", "reply.started", "timeout", "reply.done"]).fired).toEqual([3]);
  });
});
