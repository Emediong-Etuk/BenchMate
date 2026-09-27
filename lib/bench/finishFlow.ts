// Voice finish (brief §8.8): after finish_session's tool.result is sent, the
// agent speaks a closing reply; end the session once that reply is done.
//
// Ordering subtlety: the reply.done that flushes the tool result reaches the
// controller *after* the result is marked sent, so "armed" must ignore it and
// wait for the next reply.started → reply.done.

export type FinishState = "idle" | "armed" | "speaking";
export type FinishEvent = "finish_result_sent" | "reply.started" | "reply.done" | "timeout";

export const FINISH_REPLY_TIMEOUT_MS = 5_000;

export function reduceFinish(state: FinishState, event: FinishEvent): { state: FinishState; finishNow: boolean } {
  switch (event) {
    case "finish_result_sent":
      return { state: state === "idle" ? "armed" : state, finishNow: false };
    case "reply.started":
      return { state: state === "armed" ? "speaking" : state, finishNow: false };
    case "reply.done":
      return state === "speaking" ? { state: "idle", finishNow: true } : { state, finishNow: false };
    case "timeout":
      return state === "armed" ? { state: "idle", finishNow: true } : { state, finishNow: false };
  }
}
