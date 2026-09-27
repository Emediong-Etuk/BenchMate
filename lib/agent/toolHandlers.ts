import type { BenchSession, LogEntry, Timer } from "@/lib/store/types";
import { formatDuration, formatSampleList } from "./format";
import { toSpeakable } from "./speakable";
import type { ToolName } from "./tools";
import { normalizeQuantity, normalizeUnit } from "./units";

// Pure tool handlers (brief §10.2): (session, args, ctx) → next session +
// result object. The app, not the LLM, owns steps, position and data; these
// functions are the only way the agent changes them. Error messages are read
// verbatim by the model (tools docs), so they say what failed and what to ask.

export type ToolCtx = {
  now: Date;
  callId: string;
  lastUserUtterance: string;
  /** Identifies the user utterance that triggered this call (defaults to callId). */
  groupId?: string;
};

export type ToolEffects = { volume?: number; finish?: boolean };

export type ToolOutput = {
  nextState: BenchSession;
  result: Record<string, unknown>;
  isError: boolean;
  effects?: ToolEffects;
  /** Entries created by this call (for commit tracking). */
  entryIds?: string[];
};

export const MAX_RUNNING_TIMERS = 5;
const VOLUME_STEP = 20;

type Args = Record<string, unknown>;

export function runTool(name: string, session: BenchSession, args: Args, ctx: ToolCtx): ToolOutput {
  switch (name as ToolName) {
    case "navigate_protocol":
      return navigate(session, args, ctx);
    case "record_measurement":
      return recordMeasurement(session, args, ctx);
    case "log_deviation":
      return logDeviation(session, args, ctx);
    case "log_observation":
      return logObservation(session, args, ctx);
    case "void_last_entry":
      return voidLastEntry(session, ctx);
    case "start_timer":
      return startTimer(session, args, ctx);
    case "list_timers":
      return listTimers(session, ctx);
    case "cancel_timer":
      return cancelTimer(session, args, ctx);
    case "set_volume":
      return setVolume(session, args);
    case "finish_session":
      return finishSession(session, ctx);
    default:
      return fail(session, `Unknown tool '${name}'. Tell the user that action isn't available.`);
  }
}

// ------------------------------------------------------------------ helpers

function fail(session: BenchSession, error: string): ToolOutput {
  return { nextState: session, result: { ok: false, error }, isError: true };
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const int = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) ? v : null);

function total(s: BenchSession) {
  return s.protocol.steps.length;
}

/** Resolve an optional explicit step number for logging tools. */
function resolveLogStep(s: BenchSession, raw: unknown): { step: number } | { error: string } {
  if (raw === undefined || raw === null) return { step: s.currentStep };
  const n = int(raw);
  if (n === null || n < 1 || n > total(s)) {
    return { error: `There is no step ${String(raw)}; the protocol has ${total(s)} steps. Ask which step they meant, or log it without a step number.` };
  }
  return { step: n };
}

function stepPayload(s: BenchSession, n: number) {
  const step = s.protocol.steps[n - 1]!;
  return {
    step_number: n,
    total_steps: total(s),
    step_text: step.text,
    say: `Step ${n}. ${toSpeakable(step.text)}`,
    duration_seconds: step.durationSeconds,
    is_last_step: n === total(s),
  };
}

function startStep(s: BenchSession, n: number, at: string): BenchSession {
  return { ...s, currentStep: n, stepEvents: [...s.stepEvents, { stepNumber: n, startedAt: at }] };
}

function completeCurrent(s: BenchSession, at: string): BenchSession {
  const cur = s.currentStep;
  if (cur < 1) return s;
  const events = [...s.stepEvents];
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]!;
    if (e.stepNumber === cur && !e.completedAt) {
      events[i] = { ...e, completedAt: at };
      return { ...s, stepEvents: events };
    }
  }
  // Reached via previous/goto without an open event: record a zero-length visit.
  return { ...s, stepEvents: [...events, { stepNumber: cur, startedAt: at, completedAt: at }] };
}

function entryId(ctx: ToolCtx, i = 0) {
  return `e-${ctx.callId}-${i}`;
}

function sampleWarning(s: BenchSession, sampleIds: string[]): string | undefined {
  if (!s.samples.length) return undefined;
  const known = new Set(s.samples.map((x) => x.toLowerCase()));
  const unknown = [...new Set(sampleIds.filter((id) => id !== "none" && !known.has(id.toLowerCase())))];
  if (!unknown.length) return undefined;
  const list = unknown.map((u) => `'${u}'`).join(", ");
  return `Sample ${list} ${unknown.length === 1 ? "isn't" : "aren't"} in this run's sample list (${formatSampleList(s.samples)}). It was logged anyway; confirm with the user.`;
}

export function summarizeEntry(e: LogEntry): string {
  switch (e.kind) {
    case "measurement": {
      const p = e.payload;
      const who = p.sampleId === "none" ? "" : `sample ${p.sampleId} `;
      return `measurement: ${who}${p.quantity} ${p.value}${p.unit ? ` ${p.unit}` : ""}`;
    }
    case "deviation":
      return `deviation: ${e.payload.description}`;
    case "observation":
      return `observation: ${e.payload.text}`;
  }
}

// ------------------------------------------------------------- navigation

function navigate(s: BenchSession, args: Args, ctx: ToolCtx): ToolOutput {
  const action = str(args.action);
  const at = ctx.now.toISOString();
  const n = total(s);
  if (n === 0) return fail(s, "The protocol has no steps. Tell the user to add steps on the setup screen.");

  switch (action) {
    case "next": {
      if (s.currentStep === 0) {
        const next = startStep(s, 1, at);
        return { nextState: next, result: { ok: true, ...stepPayload(next, 1) }, isError: false };
      }
      if (s.currentStep >= n) {
        return fail(s, `Already on the final step (${n} of ${n}). Ask whether they want to finish the session.`);
      }
      const completed = s.currentStep;
      const next = startStep(completeCurrent(s, at), completed + 1, at);
      return { nextState: next, result: { ok: true, ...stepPayload(next, completed + 1), completed_step_number: completed }, isError: false };
    }
    case "previous": {
      if (s.currentStep === 0) return fail(s, "The protocol hasn't started yet. Ask if they want to start at step 1.");
      if (s.currentStep === 1) return fail(s, `Already at step 1 of ${n}.`);
      const next = startStep(s, s.currentStep - 1, at);
      return { nextState: next, result: { ok: true, ...stepPayload(next, next.currentStep) }, isError: false };
    }
    case "goto": {
      const target = int(args.step_number);
      if (target === null) return fail(s, `No step number was given. Ask which step (1 to ${n}) they want.`);
      if (target < 1 || target > n) return fail(s, `There is no step ${target}; the protocol has ${n} steps. Ask which step they meant.`);
      const next = target === s.currentStep ? s : startStep(s, target, at);
      return { nextState: next, result: { ok: true, ...stepPayload(next, target) }, isError: false };
    }
    case "repeat":
    case "current": {
      if (s.currentStep === 0) return fail(s, "The protocol hasn't started yet. Ask if they want to start at step 1.");
      return { nextState: s, result: { ok: true, ...stepPayload(s, s.currentStep) }, isError: false };
    }
    default:
      return fail(s, `Unknown navigation action '${action}'. Use next, previous, repeat, goto, or current.`);
  }
}

// ---------------------------------------------------------------- logging

function recordMeasurement(s: BenchSession, args: Args, ctx: ToolCtx): ToolOutput {
  // The schema is one reading per call (NOTES C13); the brief's array form is
  // still accepted in case a model sends it.
  const raw = Array.isArray(args.measurements) ? args.measurements : args.value !== undefined || args.quantity !== undefined ? [args] : [];
  if (raw.length === 0) return fail(s, "No measurements were included. Ask the user to repeat the value with its unit.");
  const stepRes = resolveLogStep(s, args.step_number);
  if ("error" in stepRes) return fail(s, stepRes.error);

  const parsed: { sampleId: string; quantity: string; value: number; unit: string }[] = [];
  for (let i = 0; i < raw.length; i++) {
    const m = (raw[i] ?? {}) as Args;
    const value = m.value;
    const quantity = normalizeQuantity(str(m.quantity));
    if (typeof value !== "number" || !Number.isFinite(value)) {
      const what = quantity || `reading ${i + 1}`;
      return fail(s, `The value for ${what} wasn't a valid number, so nothing was logged. Ask the user to repeat it.`);
    }
    if (!quantity) return fail(s, `The reading ${value} has no quantity, so nothing was logged. Ask what was measured.`);
    parsed.push({ sampleId: str(m.sample_id) || "none", quantity, value, unit: normalizeUnit(str(m.unit)) });
  }

  const at = ctx.now.toISOString();
  const entries: LogEntry[] = parsed.map((p, i) => ({
    id: entryId(ctx, i),
    kind: "measurement",
    createdAt: at,
    stepNumber: stepRes.step,
    sourceUtterance: ctx.lastUserUtterance,
    callId: ctx.callId,
    groupId: ctx.groupId ?? ctx.callId,
    status: "pending",
    payload: p,
  }));

  const readback = readbackFor(parsed);
  const warning = sampleWarning(s, parsed.map((p) => p.sampleId));
  return {
    nextState: { ...s, entries: [...s.entries, ...entries] },
    result: {
      ok: true,
      logged: parsed.map((p, i) => ({ entry_id: entries[i]!.id, sample_id: p.sampleId, quantity: p.quantity, value: p.value, unit: p.unit })),
      step_number: stepRes.step,
      readback,
      say: toSpeakable(readback),
      ...(warning ? { warning } : {}),
    },
    isError: false,
    entryIds: entries.map((e) => e.id),
  };
}

/** "sample 2: 245 ng/µL; 260/280 1.86" (grouped by sample, in order). */
export function readbackFor(items: { sampleId: string; quantity: string; value: number; unit: string }[]): string {
  const groups: { sampleId: string; parts: string[] }[] = [];
  for (const it of items) {
    const part = it.quantity === "concentration" ? `${it.value}${it.unit ? ` ${it.unit}` : ""}` : `${it.quantity} ${it.value}${it.unit ? ` ${it.unit}` : ""}`;
    const g = groups.find((x) => x.sampleId === it.sampleId);
    if (g) g.parts.push(part);
    else groups.push({ sampleId: it.sampleId, parts: [part] });
  }
  return groups.map((g) => (g.sampleId === "none" ? g.parts.join("; ") : `sample ${g.sampleId}: ${g.parts.join("; ")}`)).join(". ");
}

function logDeviation(s: BenchSession, args: Args, ctx: ToolCtx): ToolOutput {
  const description = str(args.description);
  if (!description) return fail(s, "The deviation had no description, so nothing was logged. Ask what they did differently.");
  const stepRes = resolveLogStep(s, args.step_number);
  if ("error" in stepRes) return fail(s, stepRes.error);
  const planned = str(args.planned) || undefined;
  const actual = str(args.actual) || undefined;
  const entry: LogEntry = {
    id: entryId(ctx),
    kind: "deviation",
    createdAt: ctx.now.toISOString(),
    stepNumber: stepRes.step,
    sourceUtterance: ctx.lastUserUtterance,
    callId: ctx.callId,
    groupId: ctx.groupId ?? ctx.callId,
    status: "pending",
    payload: { description, ...(planned ? { planned } : {}), ...(actual ? { actual } : {}) },
  };
  return {
    nextState: { ...s, entries: [...s.entries, entry] },
    result: { ok: true, entry_id: entry.id, step_number: stepRes.step, description, planned: planned ?? null, actual: actual ?? null },
    isError: false,
    entryIds: [entry.id],
  };
}

function logObservation(s: BenchSession, args: Args, ctx: ToolCtx): ToolOutput {
  const text = str(args.text);
  if (!text) return fail(s, "The observation was empty, so nothing was logged. Ask what they noticed.");
  const stepRes = resolveLogStep(s, args.step_number);
  if ("error" in stepRes) return fail(s, stepRes.error);
  const sampleId = str(args.sample_id) || undefined;
  const entry: LogEntry = {
    id: entryId(ctx),
    kind: "observation",
    createdAt: ctx.now.toISOString(),
    stepNumber: stepRes.step,
    sourceUtterance: ctx.lastUserUtterance,
    callId: ctx.callId,
    groupId: ctx.groupId ?? ctx.callId,
    status: "pending",
    payload: { text, ...(sampleId ? { sampleId } : {}) },
  };
  const warning = sampleId ? sampleWarning(s, [sampleId]) : undefined;
  return {
    nextState: { ...s, entries: [...s.entries, entry] },
    result: { ok: true, entry_id: entry.id, step_number: stepRes.step, text, sample_id: sampleId ?? null, ...(warning ? { warning } : {}) },
    isError: false,
    entryIds: [entry.id],
  };
}

function voidLastEntry(s: BenchSession, ctx: ToolCtx): ToolOutput {
  const live = s.entries.filter((e) => e.status !== "voided");
  if (live.length === 0) return fail(s, "There are no entries to void yet.");
  // Most recent by creation time; ties resolved by position (later wins).
  let last = live[0]!;
  for (const e of live) if (e.createdAt >= last.createdAt) last = e;
  const at = ctx.now.toISOString();
  const voided: LogEntry[] = [];
  // Void the whole utterance: every entry sharing the latest entry's group.
  const group = last.groupId ?? last.callId;
  const entries = s.entries.map((e) => {
    if ((e.groupId ?? e.callId) !== group || e.status === "voided") return e;
    const v = { ...e, status: "voided" as const, voidedAt: at };
    voided.push(v);
    return v;
  });
  return {
    nextState: { ...s, entries },
    result: { ok: true, voided: voided.map(summarizeEntry) },
    isError: false,
  };
}

// ----------------------------------------------------------------- timers

function running(s: BenchSession): Timer[] {
  return s.timers.filter((t) => t.status === "running");
}

function clock(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function startTimer(s: BenchSession, args: Args, ctx: ToolCtx): ToolOutput {
  const seconds = int(args.duration_seconds);
  if (seconds === null || seconds < 1 || seconds > 86_400) {
    return fail(s, "The timer duration wasn't a whole number of seconds between 1 and 86400. Ask how long the timer should be.");
  }
  const active = running(s);
  if (active.length >= MAX_RUNNING_TIMERS) {
    return fail(
      s,
      `There are already ${MAX_RUNNING_TIMERS} timers running (${active.map((t) => t.label).join(", ")}). Ask the user to cancel one first.`,
    );
  }
  const stepLabel = s.currentStep > 0 ? `step ${s.currentStep}` : "timer";
  const label = str(args.label) || stepLabel;
  const ends = new Date(ctx.now.getTime() + seconds * 1000);
  const timer: Timer = {
    id: `t-${ctx.callId}`,
    label,
    durationSeconds: seconds,
    startedAt: ctx.now.toISOString(),
    endsAt: ends.toISOString(),
    status: "running",
    announced: false,
  };
  return {
    nextState: { ...s, timers: [...s.timers, timer] },
    result: { ok: true, timer_id: timer.id, label, duration_seconds: seconds, duration_spoken: formatDuration(seconds), ends_at_local: clock(ends) },
    isError: false,
  };
}

export function secondsRemaining(t: Timer, now: Date): number {
  return Math.max(0, Math.ceil((Date.parse(t.endsAt) - now.getTime()) / 1000));
}

function listTimers(s: BenchSession, ctx: ToolCtx): ToolOutput {
  return {
    nextState: s,
    result: { ok: true, timers: running(s).map((t) => ({ label: t.label, seconds_remaining: secondsRemaining(t, ctx.now) })) },
    isError: false,
  };
}

function cancelTimer(s: BenchSession, args: Args, ctx: ToolCtx): ToolOutput {
  const active = running(s);
  if (active.length === 0) return fail(s, "No timers are running.");
  const label = str(args.label).toLowerCase();
  let matches: Timer[];
  if (!label) {
    if (active.length > 1) {
      return fail(s, `${active.length} timers are running (${active.map((t) => t.label).join(", ")}). Ask which one to cancel.`);
    }
    matches = active;
  } else {
    const exact = active.filter((t) => t.label.toLowerCase() === label);
    matches = exact.length ? exact : active.filter((t) => t.label.toLowerCase().includes(label) || label.includes(t.label.toLowerCase()));
  }
  if (matches.length === 0) {
    return fail(s, `No running timer matches '${str(args.label)}'. Running: ${active.map((t) => t.label).join(", ")}. Ask which one to cancel.`);
  }
  if (matches.length > 1) {
    return fail(s, `More than one timer matches '${str(args.label)}': ${matches.map((t) => t.label).join(", ")}. Ask which one to cancel.`);
  }
  const target = matches[0]!;
  const at = ctx.now.toISOString();
  return {
    nextState: { ...s, timers: s.timers.map((t) => (t.id === target.id ? { ...t, status: "cancelled", finishedAt: at } : t)) },
    result: { ok: true, cancelled: target.label, seconds_remaining: secondsRemaining(target, ctx.now) },
    isError: false,
  };
}

// ------------------------------------------------------------------- misc

function setVolume(s: BenchSession, args: Args): ToolOutput {
  const change = str(args.change);
  const current = s.settings.volume;
  let level: number;
  if (change === "up") level = current + VOLUME_STEP;
  else if (change === "down") level = current - VOLUME_STEP;
  else if (change === "set") {
    const l = int(args.level);
    if (l === null) return fail(s, `No level was given. Volume is ${current} percent; ask what level (0 to 150) they want.`);
    level = l;
  } else return fail(s, `Unknown volume change '${change}'. Use up, down, or set.`);
  level = Math.max(0, Math.min(150, level));
  return {
    nextState: { ...s, settings: { ...s.settings, volume: level } },
    result: { ok: true, level, ...(level === 150 ? { note: "That's the maximum." } : level === 0 ? { note: "Speech is now muted." } : {}) },
    isError: false,
    effects: { volume: level },
  };
}

function finishSession(s0: BenchSession, ctx: ToolCtx): ToolOutput {
  // Finishing on the final step completes it (there's no "next" past it).
  const s = s0.currentStep > 0 && s0.currentStep === total(s0) ? completeCurrent(s0, ctx.now.toISOString()) : s0;
  const live = s.entries.filter((e) => e.status !== "voided");
  const completed = new Set(s.stepEvents.filter((e) => e.completedAt).map((e) => e.stepNumber));
  return {
    nextState: s,
    result: {
      ok: true,
      steps_completed: completed.size,
      total_steps: total(s),
      measurements: live.filter((e) => e.kind === "measurement").length,
      deviations: live.filter((e) => e.kind === "deviation").length,
      observations: live.filter((e) => e.kind === "observation").length,
    },
    isError: false,
    effects: { finish: true },
  };
}
