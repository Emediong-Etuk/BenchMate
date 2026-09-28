"use client";

import { useState } from "react";
import { MAX_KEYTERMS_TOTAL } from "@/lib/agent/keyterms";

type Props = { terms: string[]; onChange: (terms: string[]) => void; mergedCount: number };

/** Editable protocol keyterms, with the merged count against the 100 cap. */
export function KeytermChips({ terms, onChange, mergedCount }: Props) {
  const [input, setInput] = useState("");

  function add() {
    const additions = input
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .filter((t) => !terms.some((x) => x.toLowerCase() === t.toLowerCase()));
    if (additions.length) onChange([...terms, ...additions]);
    setInput("");
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-wrap gap-2">
        {terms.map((t) => (
          <li key={t} className="flex items-center gap-1 rounded-full bg-surface-3 py-1 pl-3 pr-1 text-sm text-text">
            <span>{t}</span>
            <button
              type="button"
              onClick={() => onChange(terms.filter((x) => x !== t))}
              className="grid h-7 w-7 place-items-center rounded-full text-faint hover:bg-bg hover:text-bad"
              aria-label={`Remove ${t}`}
            >
              ×
            </button>
          </li>
        ))}
        {terms.length === 0 && <li className="text-sm text-muted">None yet.</li>}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. Buffer P1, Qubit"
          className="min-h-11 min-w-0 flex-1 rounded-xl border border-border bg-bg px-3 text-text placeholder:text-faint"
        />
        <button type="submit" className="min-h-11 rounded-xl border border-border-strong px-4 font-semibold hover:border-accent disabled:opacity-40" disabled={!input.trim()}>
          Add
        </button>
      </form>
      <p className="text-sm text-muted">
        <span className={`font-mono ${mergedCount >= MAX_KEYTERMS_TOTAL ? "text-warn" : ""}`}>
          {mergedCount} / {MAX_KEYTERMS_TOTAL}
        </span>{" "}
        words in use, including sample names and common lab words. Add only rare names (reagents, kits, instruments); everyday words don&apos;t need it.
      </p>
    </div>
  );
}
