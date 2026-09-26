"use client";

import { useState } from "react";
import { formatDuration, parseDurationInput } from "@/lib/agent/format";
import type { Step } from "@/lib/protocol/types";

type Props = { steps: Step[]; onChange: (steps: Step[]) => void };

const renumber = (steps: Step[]) => steps.map((s, i) => ({ ...s, number: i + 1 }));
const blank = (): Step => ({ number: 0, text: "", durationSeconds: null, reagents: [] });

/** Edit, delete, insert, and reorder steps (brief §11.3). */
export function StepEditor({ steps, onChange }: Props) {
  const update = (i: number, patch: Partial<Step>) => onChange(renumber(steps.map((s, j) => (j === i ? { ...s, ...patch } : s))));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= steps.length) return;
    const next = [...steps];
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange(renumber(next));
  };
  const insertAfter = (i: number) => onChange(renumber([...steps.slice(0, i + 1), blank(), ...steps.slice(i + 1)]));
  const remove = (i: number) => onChange(renumber(steps.filter((_, j) => j !== i)));

  return (
    <ol className="flex flex-col gap-3">
      {steps.map((step, i) => (
        <li key={i} className="rounded-2xl border border-border bg-surface p-4">
          <div className="flex items-start gap-3">
            <span className="mt-2 w-8 shrink-0 text-right font-mono text-lg font-semibold text-muted">{step.number}</span>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <textarea
                value={step.text}
                onChange={(e) => update(i, { text: e.target.value })}
                rows={Math.max(2, Math.ceil(step.text.length / 70))}
                aria-label={`Step ${step.number} text`}
                placeholder="Describe this step exactly as it should be read aloud"
                className={`w-full resize-y rounded-xl border bg-bg px-3 py-2 text-base leading-6 ${step.text.trim() ? "border-border" : "border-warn"}`}
              />
              <div className="flex flex-wrap items-center gap-2">
                <DurationChip seconds={step.durationSeconds} onChange={(d) => update(i, { durationSeconds: d })} />
                <div className="ml-auto flex gap-1">
                  <IconButton label={`Move step ${step.number} up`} onClick={() => move(i, -1)} disabled={i === 0}>
                    ↑
                  </IconButton>
                  <IconButton label={`Move step ${step.number} down`} onClick={() => move(i, 1)} disabled={i === steps.length - 1}>
                    ↓
                  </IconButton>
                  <IconButton label={`Insert a step after step ${step.number}`} onClick={() => insertAfter(i)}>
                    +
                  </IconButton>
                  <IconButton label={`Delete step ${step.number}`} onClick={() => remove(i)} danger>
                    ×
                  </IconButton>
                </div>
              </div>
            </div>
          </div>
        </li>
      ))}
      {steps.length === 0 && (
        <li>
          <button type="button" onClick={() => onChange([{ ...blank(), number: 1 }])} className="min-h-14 rounded-2xl border-2 border-dashed border-border px-5">
            Add the first step
          </button>
        </li>
      )}
    </ol>
  );
}

function IconButton({ label, onClick, disabled, danger, children }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`grid h-11 w-11 place-items-center rounded-xl border border-border text-lg disabled:opacity-30 ${danger ? "hover:border-bad hover:text-bad" : "hover:border-accent hover:text-accent"}`}
    >
      {children}
    </button>
  );
}

function DurationChip({ seconds, onChange }: { seconds: number | null; onChange: (s: number | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [invalid, setInvalid] = useState(false);

  if (editing) {
    const commit = () => {
      const parsed = parseDurationInput(value);
      if (parsed === undefined) {
        setInvalid(true);
        return;
      }
      onChange(parsed);
      setEditing(false);
    };
    return (
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          commit();
        }}
      >
        <input
          autoFocus
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setInvalid(false);
          }}
          onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
          placeholder="e.g. 90, 1:30, 5 min"
          aria-label="Step duration"
          aria-invalid={invalid}
          className={`min-h-11 w-40 rounded-xl border bg-bg px-3 font-mono text-sm ${invalid ? "border-bad" : "border-border"}`}
        />
        <button type="submit" className="min-h-11 rounded-xl border border-border px-3 text-sm font-semibold">
          Set
        </button>
      </form>
    );
  }
  return (
    <button
      type="button"
      onClick={() => {
        setValue(seconds ? String(seconds) : "");
        setEditing(true);
      }}
      className={`min-h-11 rounded-full border px-4 font-mono text-sm ${seconds ? "border-accent bg-accent-soft text-text" : "border-dashed border-border text-muted"}`}
    >
      {seconds ? `⏱ ${formatDuration(seconds)}` : "+ duration"}
    </button>
  );
}
