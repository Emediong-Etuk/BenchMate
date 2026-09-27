"use client";

import { formatDuration } from "@/lib/agent/format";
import type { BenchSession } from "@/lib/store/types";

/** The hero: current step huge, neighbours faded, progress bar (brief §12). */
export function StepCard({ session }: { session: BenchSession }) {
  const steps = session.protocol.steps;
  const total = steps.length;
  const n = session.currentStep;
  const current = n > 0 ? steps[n - 1] : undefined;
  const prev = n > 1 ? steps[n - 2] : undefined;
  const next = n < total ? steps[n] : undefined;
  const completed = new Set(session.stepEvents.filter((e) => e.completedAt).map((e) => e.stepNumber)).size;

  return (
    <section aria-live="polite" className="flex flex-col gap-4 rounded-3xl border border-border bg-surface p-6 sm:p-8">
      <div className="flex items-center gap-3">
        <p className="font-mono text-lg text-muted">{n > 0 ? `Step ${n} of ${total}` : `${total} steps`}</p>
        {current?.durationSeconds ? (
          <span className="rounded-full border border-accent bg-accent-soft px-3 py-1 font-mono text-sm">⏱ {formatDuration(current.durationSeconds)}</span>
        ) : null}
      </div>

      {prev && <p className="line-clamp-2 text-lg text-muted/70">{prev.number}. {prev.text}</p>}

      {current ? (
        <p className="text-[32px] font-semibold leading-tight sm:text-[40px] lg:text-[44px]">{current.text}</p>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-[32px] font-semibold leading-tight sm:text-[40px]">Say &ldquo;start&rdquo; to read step 1.</p>
          <p className="text-lg text-muted">{steps[0]?.text}</p>
        </div>
      )}

      {current && next && <p className="line-clamp-2 text-lg text-muted/70">Next: {next.number}. {next.text}</p>}
      {current && !next && <p className="text-lg text-muted">Final step. Say &ldquo;I&apos;m done&rdquo; to finish.</p>}

      <div className="mt-2 flex items-center gap-3">
        <div className="h-3 flex-1 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={completed} aria-label="Steps completed">
          <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${total ? (completed / total) * 100 : 0}%` }} />
        </div>
        <span className="font-mono text-sm text-muted">
          {completed}/{total} done
        </span>
      </div>
    </section>
  );
}
