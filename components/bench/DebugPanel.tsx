"use client";

import { useEffect, useRef, useState } from "react";
import { useVoiceStore } from "@/lib/store/voiceStore";

type Props = {
  onSendText: (text: string) => void;
  canSend: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
};

/** Event log (audio shown as byte counts) plus a typed-utterance box. */
export function DebugPanel({ onSendText, canSend, inputRef }: Props) {
  const log = useVoiceStore((s) => s.log);
  const clearLog = useVoiceStore((s) => s.clearLog);
  const [text, setText] = useState("");
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log]);

  return (
    <section className="no-print flex min-h-0 flex-col gap-3 rounded-3xl border border-border bg-surface p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-text">Developer panel</h2>
        <button type="button" onClick={clearLog} className="rounded-lg px-3 py-1 text-sm text-muted hover:bg-surface-2">
          Clear
        </button>
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim() || !canSend) return;
          onSendText(text);
          setText("");
        }}
      >
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={canSend ? "Type what you'd say… (T)" : "Start listening first"}
          disabled={!canSend}
          className="min-h-12 min-w-0 flex-1 rounded-xl border border-border bg-bg px-3 text-base text-text placeholder:text-faint disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!canSend || !text.trim()}
          className="min-h-12 rounded-xl bg-accent px-4 font-semibold text-on-accent hover:bg-accent-strong disabled:opacity-40"
        >
          Send
        </button>
      </form>
      <ol ref={listRef} className="max-h-80 min-h-40 overflow-y-auto font-mono text-xs leading-5">
        {log.map((row, i) => (
          <li key={i} className="flex gap-2 border-b border-border/50 py-0.5">
            <span className="shrink-0 text-muted">{new Date(row.at).toLocaleTimeString([], { hour12: false })}</span>
            <span className={`shrink-0 ${row.dir === "in" ? "text-accent" : row.dir === "out" ? "text-warn" : "text-muted"}`}>
              {row.dir === "in" ? "←" : row.dir === "out" ? "→" : "·"}
            </span>
            <span className="shrink-0 font-semibold">{row.type}</span>
            <span className="min-w-0 break-words text-muted">
              {row.detail}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
