import { formatDuration, formatSampleList } from "@/lib/agent/format";
import type { BenchSession, LogEntry } from "@/lib/store/types";

// Deterministic notebook entry model (brief §13). Built only from logged
// data: no LLM touches values, the step log, or the tables. The Markdown
// export and the entry page both render this model.

export type EntryOptions = { timeZone?: string; now?: Date };

export type Row = string[];
export type Table = { headers: string[]; rows: Row[] };

export type EntryModel = {
  title: string;
  header: {
    date: string;
    researcher: string;
    duration: string;
    started: string;
    ended: string;
    samples: string;
  };
  summary: {
    stepsCompleted: number;
    totalSteps: number;
    measurements: number;
    deviations: number;
    observations: number;
    voided: number;
    unconfirmed: number;
  };
  deviations: Table;
  measurements: Table;
  observations: Table;
  stepLog: Table;
  timers: Table;
  voided: Table;
  unconfirmed: Table;
  sourceUtterances: string[];
  transcript: string[];
  sessionIds: string[];
  protocolSnapshot: string[];
  hasUnconfirmedInTables: boolean;
};

const DASH = "—";
const UNCONFIRMED_MARK = " †";

function fmt(timeZone: string | undefined) {
  const time = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  const date = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  return {
    time: (iso?: string) => (iso ? time.format(new Date(iso)) : DASH),
    date: (iso: string) => date.format(new Date(iso)),
  };
}

/** Human duration between two instants: "1 h 12 min", "8 min", "45 s". */
export function humanDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h} h ${m} min` : `${m} min`;
}

/** Natural sample order: numbers numerically, then names; "none" last. */
export function compareSamples(a: string, b: string): number {
  if (a === b) return 0;
  if (a === "none") return 1;
  if (b === "none") return -1;
  const na = /^\d+$/.test(a);
  const nb = /^\d+$/.test(b);
  if (na && nb) return Number(a) - Number(b);
  if (na) return -1;
  if (nb) return 1;
  return a.localeCompare(b, "en", { numeric: true, sensitivity: "base" });
}

export function describeEntry(e: LogEntry): string {
  switch (e.kind) {
    case "measurement": {
      const p = e.payload;
      return `${p.sampleId === "none" ? "" : `sample ${p.sampleId}: `}${p.quantity} ${p.value}${p.unit ? ` ${p.unit}` : ""}`;
    }
    case "deviation":
      return [e.payload.description, e.payload.planned || e.payload.actual ? `(planned ${e.payload.planned ?? DASH}; actual ${e.payload.actual ?? DASH})` : ""]
        .filter(Boolean)
        .join(" ");
    case "observation":
      return `${e.payload.sampleId ? `sample ${e.payload.sampleId}: ` : ""}${e.payload.text}`;
  }
}

const stepLabel = (n: number) => (n > 0 ? String(n) : DASH);
const abridge = (text: string, max = 80) => (text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`);

export function buildEntryModel(session: BenchSession, opts: EntryOptions = {}): EntryModel {
  const f = fmt(opts.timeZone);
  const entries = session.entries;
  const live = entries.filter((e) => e.status !== "voided");
  const voided = entries.filter((e) => e.status === "voided");
  const unconfirmed = entries.filter((e) => e.status === "unconfirmed");
  const mark = (e: LogEntry) => (e.status === "unconfirmed" ? UNCONFIRMED_MARK : "");
  const byTime = (a: LogEntry, b: LogEntry) => a.createdAt.localeCompare(b.createdAt);

  const liveOf = <K extends LogEntry["kind"]>(kind: K) =>
    live.filter((e): e is Extract<LogEntry, { kind: K }> => e.kind === kind).sort(byTime);

  const measurements = liveOf("measurement").sort((a, b) => {
    const s = compareSamples(a.payload.sampleId, b.payload.sampleId);
    if (s) return s;
    const q = a.payload.quantity.localeCompare(b.payload.quantity);
    return q || a.createdAt.localeCompare(b.createdAt);
  });
  const deviations = liveOf("deviation");
  const observations = liveOf("observation");

  // Step log: first start and last completion per step, every protocol step listed.
  const stepLogRows: Row[] = session.protocol.steps.map((step) => {
    const events = session.stepEvents.filter((e) => e.stepNumber === step.number);
    const started = events.map((e) => e.startedAt).sort()[0];
    const completed = events
      .map((e) => e.completedAt)
      .filter((x): x is string => Boolean(x))
      .sort()
      .at(-1);
    // Step times matter in a lab record: keep seconds ("1 min 45 s").
    const duration = started && completed ? formatDuration((Date.parse(completed) - Date.parse(started)) / 1000) : DASH;
    return [String(step.number), abridge(step.text), f.time(started), f.time(completed), duration];
  });
  const stepsCompleted = new Set(session.stepEvents.filter((e) => e.completedAt).map((e) => e.stepNumber)).size;

  const auditRow = (e: LogEntry): Row => [
    f.time(e.createdAt),
    e.kind,
    describeEntry(e),
    e.status === "voided" ? f.time(e.voidedAt) : DASH,
    e.sourceUtterance ? `“${e.sourceUtterance}”` : DASH,
  ];
  const auditHeaders = ["Time", "Kind", "Content", "Voided at", "Source utterance"];

  const endIso = session.endedAt;
  const durationMs = (endIso ? Date.parse(endIso) : (opts.now ?? new Date()).getTime()) - Date.parse(session.startedAt);

  return {
    title: session.protocol.title,
    header: {
      date: f.date(session.startedAt),
      researcher: session.researcherName?.trim() || DASH,
      duration: endIso ? humanDuration(durationMs) : `${humanDuration(durationMs)} (in progress)`,
      started: f.time(session.startedAt),
      ended: endIso ? f.time(endIso) : "in progress",
      samples: session.samples.length ? formatSampleList(session.samples) : DASH,
    },
    summary: {
      stepsCompleted,
      totalSteps: session.protocol.steps.length,
      measurements: measurements.length,
      deviations: deviations.length,
      observations: observations.length,
      voided: voided.length,
      unconfirmed: unconfirmed.length,
    },
    deviations: {
      headers: ["Step", "Time", "Description", "Planned", "Actual"],
      rows: deviations.map((e) => [stepLabel(e.stepNumber), f.time(e.createdAt), e.payload.description + mark(e), e.payload.planned ?? DASH, e.payload.actual ?? DASH]),
    },
    measurements: {
      headers: ["Sample", "Quantity", "Value", "Unit", "Step", "Time"],
      rows: measurements.map((e) => [
        e.payload.sampleId === "none" ? DASH : e.payload.sampleId,
        e.payload.quantity,
        String(e.payload.value) + mark(e),
        e.payload.unit || DASH,
        stepLabel(e.stepNumber),
        f.time(e.createdAt),
      ]),
    },
    observations: {
      headers: ["Step", "Time", "Sample", "Observation"],
      rows: observations.map((e) => [stepLabel(e.stepNumber), f.time(e.createdAt), e.payload.sampleId ?? DASH, e.payload.text + mark(e)]),
    },
    stepLog: { headers: ["#", "Step (abridged)", "Started", "Completed", "Duration"], rows: stepLogRows },
    timers: {
      headers: ["Label", "Duration", "Started", "Finished/Cancelled"],
      rows: [...session.timers]
        .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
        .map((t) => [
          t.label,
          formatDuration(t.durationSeconds),
          f.time(t.startedAt),
          t.status === "cancelled" ? `${f.time(t.finishedAt)} (cancelled)` : t.status === "done" ? `${f.time(t.finishedAt ?? t.endsAt)} (finished)` : "running",
        ]),
    },
    voided: { headers: auditHeaders, rows: [...voided].sort(byTime).map(auditRow) },
    unconfirmed: { headers: auditHeaders, rows: [...unconfirmed].sort(byTime).map(auditRow) },
    sourceUtterances: [...live]
      .sort(byTime)
      .map((e) => `[${f.time(e.createdAt)}] ${e.kind}: ${describeEntry(e)} ← ${e.sourceUtterance ? `“${e.sourceUtterance}”` : DASH}`),
    transcript: session.transcript.map(
      (l) => `[${f.time(l.at)}] ${l.role === "user" ? (l.typed ? "User (typed)" : "User") : "BenchMate"}: ${l.text}${l.interrupted ? " [interrupted]" : ""}`,
    ),
    sessionIds: session.assemblyaiSessionIds,
    protocolSnapshot: session.protocol.steps.map((s) => `${s.number}. ${s.text}`),
    hasUnconfirmedInTables: unconfirmed.length > 0,
  };
}
