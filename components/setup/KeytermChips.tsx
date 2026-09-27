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
          <li key={t} className="flex items-center gap-1 rounded-full border border-border bg-surface-2 py-1 pl-3 pr-1 text-sm">
            <span>{t}</span>
            <button
              type="button"
              onClick={() => onChange(terms.filter((x) => x !== t))}
              className="grid h-7 w-7 place-items-center rounded-full text-muted hover:bg-bg hover:text-bad"
              aria-label={`Remove ${t}`}
            >
              ×
            </button>
          </li>
        ))}
        {terms.length === 0 && <li className="text-sm text-muted">No protocol-specific terms yet.</li>}
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
          placeholder="Add terms, comma-separated (e.g. Buffer P1, Qubit)"
          className="min-h-12 flex-1 rounded-xl border border-border bg-bg px-3"
        />
        <button type="submit" className="min-h-12 rounded-xl border-2 border-border px-4 font-semibold" disabled={!input.trim()}>
          Add
        </button>
      </form>
      <p className="text-sm text-muted">
        <span className={`font-mono ${mergedCount >= MAX_KEYTERMS_TOTAL ? "text-warn" : ""}`}>
          {mergedCount} / {MAX_KEYTERMS_TOTAL}
        </span>{" "}
        speech keyterms after adding sample names and base lab vocabulary. Keep only rare words: common words dilute the boost.
      </p>
    </div>
  );
}
