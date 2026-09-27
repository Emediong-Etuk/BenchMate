// The documented "send tool.result only when reply.done is the latest event"
// pattern (client-side tools docs), as a pure reducer. Phase 3 layers entry
// commit semantics (pending → confirmed / unconfirmed) on top.

export type PendingResult = { callId: string; result: string; isError: boolean };

export type QueueState = {
  lastEvent: "reply.done" | "reply.started" | "input.speech.started" | null;
  pending: PendingResult[];
};

export type QueueInput =
  | { type: "result_ready"; result: PendingResult }
  | { type: "reply.started" }
  | { type: "input.speech.started" }
  | { type: "reply.done"; status: "completed" | "interrupted" }
  | { type: "reset" };

export type QueueOutput = {
  state: QueueState;
  /** Results to send now, in order. */
  send: PendingResult[];
  /** Results discarded because the reply they belonged to was interrupted. */
  dropped: PendingResult[];
};

export const initialQueueState: QueueState = { lastEvent: null, pending: [] };

export function reduceQueue(state: QueueState, input: QueueInput): QueueOutput {
  switch (input.type) {
    case "result_ready":
      return flushIfIdle({ ...state, pending: [...state.pending, input.result] });
    case "reply.started":
    case "input.speech.started":
      return { state: { ...state, lastEvent: input.type }, send: [], dropped: [] };
    case "reply.done":
      if (input.status === "interrupted") {
        return { state: { lastEvent: "reply.done", pending: [] }, send: [], dropped: state.pending };
      }
      return flushIfIdle({ ...state, lastEvent: "reply.done" });
    case "reset":
      return { state: initialQueueState, send: [], dropped: state.pending };
  }
}

function flushIfIdle(state: QueueState): QueueOutput {
  if (state.lastEvent !== "reply.done" || state.pending.length === 0) {
    return { state, send: [], dropped: [] };
  }
  return { state: { ...state, pending: [] }, send: state.pending, dropped: [] };
}
