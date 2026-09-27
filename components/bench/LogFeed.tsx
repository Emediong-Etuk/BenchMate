"use client";

import type { LogEntry } from "@/lib/store/types";

const kindStyle = {
  measurement: { bar: "bg-measure", label: "Measurement", text: "text-measure" },
  deviation: { bar: "bg-deviation", label: "Deviation", text: "text-deviation" },
  observation: { bar: "bg-observation", label: "Observation", text: "text-observation" },
} as const;

function content(e: LogEntry): React.ReactNode {
  switch (e.kind) {
    case "measurement": {
      const p = e.payload;
      return (
        <>
          {p.sampleId !== "none" && <span>{p.sampleId} · </span>}
          <span>{p.quantity} · </span>
          <span className="font-mono font-semibold">
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
            <span className="block font-mono text-sm text-muted">
              {e.payload.planned ?? "?"} → {e.payload.actual ?? "?"}
            </span>
          )}
        </>
      );
    case "observation":
      return (
        <>
          {e.payload.sampleId && <span>{e.payload.sampleId} · </span>}
          {e.payload.text}
        </>
      );
  }
}

/** Newest first; pending spinner, unconfirmed dashed, voided struck through (brief §12). */
export function LogFeed({ entries }: { entries: LogEntry[] }) {
  const sorted = [...entries].reverse();
  return (
    <section className="flex min-h-0 flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Log</h2>
      {sorted.length === 0 ? (
        <p className="text-muted">Readings, deviations and observations appear here as you say them.</p>
      ) : (
        <ol className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
          {sorted.map((e) => {
            const k = kindStyle[e.kind];
            const voided = e.status === "voided";
            const unconfirmed = e.status === "unconfirmed";
            return (
              <li
                key={e.id}
                className={`flex gap-3 rounded-xl border p-3 ${unconfirmed ? "border-dashed border-warn" : "border-border"} ${voided ? "opacity-50" : ""}`}
              >
                <span className={`w-1.5 shrink-0 rounded-full ${k.bar}`} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className={`font-semibold uppercase tracking-wide ${k.text}`}>{k.label}</span>
                    <span className="text-muted">
                      {e.stepNumber > 0 ? `step ${e.stepNumber}` : "before step 1"} ·{" "}
                      {new Date(e.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
                    </span>
                    {e.status === "pending" && (
                      <span className="inline-flex items-center gap-1 text-muted">
                        <span className="h-3 w-3 animate-spin rounded-full border-2 border-muted border-t-transparent" aria-hidden /> saving
                      </span>
                    )}
                    {unconfirmed && <span className="rounded bg-warn/15 px-1.5 py-0.5 font-semibold text-warn">not read back</span>}
                    {voided && <span className="rounded bg-surface-2 px-1.5 py-0.5 font-semibold text-muted">voided</span>}
                  </div>
                  <p className={`mt-1 text-lg leading-snug ${voided ? "line-through" : ""}`}>{content(e)}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
