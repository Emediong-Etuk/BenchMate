import type { BenchSession, LogEntry } from "@/lib/store/types";
import { runTool, type ToolCtx, type ToolEffects } from "./toolHandlers";
import { normalizeQuantity, normalizeUnit } from "./units";

// Commit semantics and interruption handling (brief §10.3).
//
// - Side effects commit at tool.call time; entries start "pending".
// - When the tool.result is actually sent → "confirmed".
// - When the results queue is cleared by an interrupted reply → "unconfirmed",
//   and the call is remembered as "dropped".
// - A new call with the same tool + canonical arguments as a dropped call
//   from the last 60 s replays the stored result instead of applying again
//   (no duplicate entry, no double "next"). Confirmed calls are never deduped.
// - Position-relative calls (next/previous, volume up/down) can only be
//   replayed by the immediately following call: once anything else runs,
//   their stored result would be stale.
// - Same-turn guard: the model sometimes repeats an identical call several
//   times in one turn (observed in probes). Within one user turn an identical
//   state-changing call replays the first result. A repeat in a new turn is
//   applied normally (a repeated reading may be real).

export const DEDUP_WINDOW_MS = 60_000;

export type CallRecord = {
  callId: string;
  name: string;
  key: string;
  at: number; // ms epoch
  result: Record<string, unknown>;
  isError: boolean;
  entryIds: string[];
  effects?: ToolEffects;
  relative: boolean;
  turn: number;
};

export type LedgerState = {
  inflight: Record<string, CallRecord>;
  dropped: CallRecord[];
  recent: CallRecord[];
  turn: number;
  /** Unique id of the current user utterance (entries' groupId). */
  turnId: string;
};

export const emptyLedger: LedgerState = { inflight: {}, dropped: [], recent: [], turn: 0, turnId: "u0" };

const MAX_RECENT = 30;

/** A new user utterance (spoken or typed) starts a new turn. */
export function newTurn(ledger: LedgerState, nowMs: number = Date.now()): LedgerState {
  const turn = ledger.turn + 1;
  return { ...ledger, turn, turnId: `u${nowMs.toString(36)}-${turn}` };
}

export type CallInput = { callId: string; name: string; args: Record<string, unknown> };

export type ApplyOutput = {
  session: BenchSession;
  ledger: LedgerState;
  result: Record<string, unknown>;
  isError: boolean;
  effects?: ToolEffects;
  replayed: boolean;
};

// Tools whose repeat would change state again. Read-only tools just re-run.
const MUTATING = new Set([
  "navigate_protocol",
  "record_measurement",
  "log_deviation",
  "log_observation",
  "void_last_entry",
  "start_timer",
  "cancel_timer",
  "set_volume",
  "finish_session",
]);

function isRelative(name: string, args: Record<string, unknown>): boolean {
  if (name === "navigate_protocol") return args.action === "next" || args.action === "previous";
  if (name === "set_volume") return args.change === "up" || args.change === "down";
  return name === "void_last_entry";
}

function isMutating(name: string, args: Record<string, unknown>): boolean {
  if (!MUTATING.has(name)) return false;
  if (name === "navigate_protocol") return args.action !== "repeat" && args.action !== "current";
  return true;
}

/** Stable key: sorted object keys, trimmed/lowercased strings, normalized units. */
export function canonicalKey(name: string, args: Record<string, unknown>): string {
  const norm = (v: unknown, key?: string): unknown => {
    if (typeof v === "string") {
      if (key === "unit") return normalizeUnit(v);
      if (key === "quantity") return normalizeQuantity(v);
      return v.trim().toLowerCase().replace(/\s+/g, " ");
    }
    if (Array.isArray(v)) return v.map((x) => norm(x));
    if (v && typeof v === "object") {
      return Object.fromEntries(
        Object.keys(v)
          .sort()
          .filter((k) => (v as Record<string, unknown>)[k] !== undefined && (v as Record<string, unknown>)[k] !== "")
          .map((k) => [k, norm((v as Record<string, unknown>)[k], k)]),
      );
    }
    return v;
  };
  return `${name}:${JSON.stringify(norm(args))}`;
}

function setStatus(session: BenchSession, ids: string[], from: LogEntry["status"][], to: LogEntry["status"]): BenchSession {
  if (!ids.length) return session;
  const set = new Set(ids);
  let changed = false;
  const entries = session.entries.map((e) => {
    if (!set.has(e.id) || !from.includes(e.status)) return e;
    changed = true;
    return { ...e, status: to };
  });
  return changed ? { ...session, entries } : session;
}

export function applyCall(session: BenchSession, ledger: LedgerState, call: CallInput, ctx: ToolCtx): ApplyOutput {
  const now = ctx.now.getTime();
  const key = canonicalKey(call.name, call.args);
  const fresh = ledger.dropped.filter((d) => now - d.at <= DEDUP_WINDOW_MS);
  const match = isMutating(call.name, call.args) ? fresh.find((d) => d.key === key) : undefined;

  const sameTurn = isMutating(call.name, call.args)
    ? [...Object.values(ledger.inflight), ...ledger.recent].find((r) => r.key === key && r.turn === ledger.turn)
    : undefined;
  if (sameTurn) {
    return {
      session,
      ledger: { ...ledger, inflight: { ...ledger.inflight, [call.callId]: { ...sameTurn, callId: call.callId, at: now } }, dropped: fresh },
      result: sameTurn.result,
      isError: sameTurn.isError,
      replayed: true,
    };
  }

  if (match) {
    const record: CallRecord = { ...match, callId: call.callId, at: now, turn: ledger.turn };
    return {
      session: setStatus(session, match.entryIds, ["unconfirmed"], "pending"),
      ledger: { ...ledger, inflight: { ...ledger.inflight, [call.callId]: record }, dropped: fresh.filter((d) => d !== match) },
      result: match.result,
      isError: match.isError,
      // Volume was already applied; finish still has to happen.
      effects: match.effects?.finish ? { finish: true } : undefined,
      replayed: true,
    };
  }

  const out = runTool(call.name, session, call.args, ctx);
  const record: CallRecord = {
    callId: call.callId,
    name: call.name,
    key,
    at: now,
    result: out.result,
    isError: out.isError,
    entryIds: out.entryIds ?? [],
    effects: out.effects,
    relative: isRelative(call.name, call.args),
    turn: ledger.turn,
  };
  return {
    session: out.nextState,
    // A fresh call makes any dropped position-relative result stale.
    ledger: { ...ledger, inflight: { ...ledger.inflight, [call.callId]: record }, dropped: fresh.filter((d) => !d.relative) },
    result: out.result,
    isError: out.isError,
    effects: out.effects,
    replayed: false,
  };
}

/** tool.result for callId was sent → confirm its entries. */
export function markSent(session: BenchSession, ledger: LedgerState, callId: string): { session: BenchSession; ledger: LedgerState; record?: CallRecord } {
  const record = ledger.inflight[callId];
  if (!record) return { session, ledger };
  const { [callId]: _done, ...inflight } = ledger.inflight;
  void _done;
  const recent = [...ledger.recent, record].slice(-MAX_RECENT);
  return { session: setStatus(session, record.entryIds, ["pending"], "confirmed"), ledger: { ...ledger, inflight, recent }, record };
}

/** Results were discarded (interrupted reply) → entries unconfirmed, calls remembered for dedup. */
export function markDropped(session: BenchSession, ledger: LedgerState, callIds: string[], nowMs: number): { session: BenchSession; ledger: LedgerState } {
  let s = session;
  const inflight = { ...ledger.inflight };
  const dropped = ledger.dropped.filter((d) => nowMs - d.at <= DEDUP_WINDOW_MS);
  for (const id of callIds) {
    const record = inflight[id];
    if (!record) continue;
    delete inflight[id];
    s = setStatus(s, record.entryIds, ["pending"], "unconfirmed");
    dropped.push({ ...record, at: nowMs }); // replay is gated on isMutating in applyCall
  }
  return { session: s, ledger: { ...ledger, inflight, dropped } };
}
