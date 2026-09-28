"use client";

import type { LogEntry } from "@/lib/store/types";

// Plain-language labels; the notebook entry uses the formal names.
const kindStyle = {
  measurement: { dot: "bg-measure", label: "Reading", text: "text-measure" },
  deviation: { dot: "bg-deviation", label: "Change from plan", text: "text-deviation" },
  observation: { dot: "bg-observation", label: "Note", text: "text-observation" },
} as const;

function content(e: LogEntry): React.ReactNode {
  switch (e.kind) {
    case "measurement": {
      const p = e.payload;
      return (
        <>
          {p.sampleId !== "none" && <span className="text-muted">Sample {p.sampleId} · </span>}
          <span className="text-muted">{p.quantity} </span>
          <span className="font-semibold text-text">
            {p.value}
            {p.unit ? ` ${p.unit}` : ""}
          </span>
        </>
      );
    }
    case "deviation":
      return (
        <>
          {e.payload.description}
          {(e.payload.planned || e.payload.actual) && (
            <span className="block text-sm text-muted">
              Planned {e.payload.planned ?? "?"} → did {e.payload.actual ?? "?"}
            </span>
          )}
        </>
      );
    case "observation":
      return (
        <>
          {e.payload.sampleId && <span className="text-muted">Sample {e.payload.sampleId} · </span>}
          {e.payload.text}
        </>
      );
  }
}

/** Newest first; pending spinner, unconfirmed dashed, voided struck through (brief §12). */
export function LogFeed({ entries }: { entries: LogEntry[] }) {
  const sorted = [...entries].reverse();
  return (
    <section className="flex min-h-0 flex-col gap-3 rounded-3xl border border-border bg-surface p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold text-text">What you&apos;ve recorded</h2>
        {entries.length > 0 && <span className="text-sm text-faint">{entries.filter((e) => e.status !== "voided").length} kept</span>}
      </div>
      {sorted.length === 0 ? (
        <p className="text-muted">Readings, changes and notes show up here as you say them.</p>
      ) : (
        <ol className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto pr-1">
          {sorted.map((e) => {
            const k = kindStyle[e.kind];
            const voided = e.status === "voided";
            const unconfirmed = e.status === "unconfirmed";
            return (
              <li
                key={e.id}
                className={`fade-up flex gap-3 rounded-2xl p-3.5 ${unconfirmed ? "border border-dashed border-warn/50" : "bg-surface-2"} ${voided ? "opacity-45" : ""}`}
              >
                <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${k.dot}`} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className={`font-medium ${k.text}`}>{k.label}</span>
                    <span className="text-faint">
                      {e.stepNumber > 0 ? `step ${e.stepNumber}` : "before step 1"} ·{" "}
                      {new Date(e.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}
                    </span>
                    {e.status === "pending" && (
                      <span className="inline-flex items-center gap-1 text-muted">
                        <span className="h-3 w-3 animate-spin rounded-full border-2 border-muted border-t-transparent" aria-hidden /> saving
                      </span>
                    )}
                    {unconfirmed && <span className="rounded-full bg-warn/10 px-2 py-0.5 text-warn">not read back</span>}
                    {voided && <span className="rounded-full bg-surface-3 px-2 py-0.5 text-muted">crossed out</span>}
                  </div>
                  <p className={`mt-1 text-lg leading-snug text-text ${voided ? "line-through" : ""}`}>{content(e)}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
