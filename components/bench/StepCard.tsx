"use client";

import { formatDuration } from "@/lib/agent/format";
import type { BenchSession } from "@/lib/store/types";

/** The hero: current step large, neighbours faded, progress bar (brief §12). */
export function StepCard({ session }: { session: BenchSession }) {
  const steps = session.protocol.steps;
  const total = steps.length;
  const n = session.currentStep;
  const current = n > 0 ? steps[n - 1] : undefined;
  const prev = n > 1 ? steps[n - 2] : undefined;
  const next = n < total ? steps[n] : undefined;
  const completed = new Set(session.stepEvents.filter((e) => e.completedAt).map((e) => e.stepNumber)).size;

  return (
    <section aria-live="polite" className="flex flex-col gap-5 rounded-3xl border border-border bg-surface p-6 sm:p-9">
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-full bg-surface-3 px-3 py-1 text-[15px] font-medium text-muted">{n > 0 ? `Step ${n} of ${total}` : `${total} steps`}</span>
        {current?.durationSeconds ? (
          <span className="rounded-full bg-accent-soft px-3 py-1 text-[15px] text-accent">⏱ {formatDuration(current.durationSeconds)}</span>
        ) : null}
      </div>

      {prev && (
        <p className="line-clamp-2 text-lg text-faint">
          {prev.number}. {prev.text}
        </p>
      )}

      {current ? (
        <p key={n} className="fade-up text-[28px] font-medium leading-snug text-text sm:text-[36px] lg:text-[40px]">
          {current.text}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-[28px] font-medium leading-snug text-text sm:text-[36px]">
            Say <span className="text-accent">&ldquo;start&rdquo;</span> to hear step 1.
          </p>
          <p className="text-lg text-muted">First up: {steps[0]?.text}</p>
        </div>
      )}

      {current && next && (
        <p className="line-clamp-2 text-lg text-faint">
          Next · {next.number}. {next.text}
        </p>
      )}
      {current && !next && <p className="text-lg text-muted">This is the last step. Say &ldquo;I&apos;m done&rdquo; when you finish.</p>}

      <div className="mt-2 flex items-center gap-4">
        <div
          className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={completed}
          aria-label="Steps completed"
        >
          <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${total ? (completed / total) * 100 : 0}%` }} />
        </div>
        <span className="text-sm text-muted">
          {completed} of {total} done
        </span>
      </div>
    </section>
  );
}
