"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Banner } from "@/components/ui/Banner";
import { MAX_INPUT_CHARS } from "@/lib/protocol/schema";
import { SAMPLES, sampleToProtocol, type SampleDef } from "@/lib/protocol/samples";
import type { ParseResult } from "@/lib/protocol/types";
import { useBenchStore } from "@/lib/store/benchStore";
import { useHydratedBenchStore } from "@/lib/store/useHydrated";

export function HomeClient() {
  const router = useRouter();
  const hydrated = useHydratedBenchStore();
  const sessions = useBenchStore((s) => s.sessions);
  const activeSessionId = useBenchStore((s) => s.activeSessionId);
  const storageError = useBenchStore((s) => s.storageError);
  const [showPaste, setShowPaste] = useState(false);

  const active = sessions.find((s) => s.id === activeSessionId && !s.endedAt);

  function pickSample(def: SampleDef) {
    const protocol = sampleToProtocol(def);
    useBenchStore.getState().setDraftFromParse({ protocol, source: "sample", missingNumbers: [] }, def.defaultSamples);
    router.push("/setup");
  }

  const [demo, miniprep, ...moreSamples] = SAMPLES;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 py-10 sm:px-6">
      <header>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">BenchMate</h1>
        <p className="mt-2 text-lg text-muted">Gloves on. Hands full. Notebook still gets written.</p>
      </header>

      {storageError && <Banner tone="warn" title="Storage problem">{storageError}</Banner>}

      {active && (
        <Banner
          tone="info"
          title={`Session in progress: ${active.protocol.title}`}
          action={
            <Link href="/bench" className="inline-flex min-h-12 items-center rounded-xl bg-accent px-5 font-semibold text-white dark:text-black">
              Resume at the bench
            </Link>
          }
        >
          {active.currentStep > 0 ? `On step ${active.currentStep} of ${active.protocol.steps.length}` : "Not started yet"} ·{" "}
          {active.entries.filter((e) => e.status !== "voided").length} entries logged
        </Banner>
      )}

      <section className="grid gap-4 md:grid-cols-3" aria-label="Choose a protocol">
        {demo && <SampleCard def={demo} label="Try the demo run" highlight onUse={pickSample} />}
        {miniprep && <SampleCard def={miniprep} label="Plasmid miniprep (sample)" onUse={pickSample} />}
        <button
          type="button"
          onClick={() => setShowPaste(true)}
          className="flex min-h-44 flex-col items-start gap-2 rounded-3xl border-2 border-dashed border-border bg-surface p-6 text-left hover:border-accent"
        >
          <span className="text-xl font-semibold">Paste or upload your own</span>
          <span className="text-muted">Text or Markdown. BenchMate splits it into steps and checks that no quantities were lost.</span>
        </button>
      </section>

      {moreSamples.length > 0 && (
        <p className="-mt-6 text-sm text-muted">
          More samples:{" "}
          {moreSamples.map((d, i) => (
            <span key={d.id}>
              {i > 0 && " · "}
              <button type="button" className="underline decoration-dotted underline-offset-4 hover:text-accent" onClick={() => pickSample(d)}>
                {d.title}
              </button>
            </span>
          ))}
        </p>
      )}

      {showPaste && <PastePanel onClose={() => setShowPaste(false)} onParsed={() => router.push("/setup")} />}

      <section aria-labelledby="recent-heading" className="flex flex-col gap-3">
        <h2 id="recent-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
          Recent sessions
        </h2>
        {!hydrated ? (
          <p className="text-muted">Loading…</p>
        ) : sessions.length === 0 ? (
          <p className="text-muted">No sessions yet. Your notebook entries will appear here, stored only in this browser.</p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {sessions.map((s) => {
              const count = s.entries.filter((e) => e.status !== "voided").length;
              const href = s.endedAt ? `/entry/${s.id}` : "/bench";
              return (
                <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                  <Link href={href} className="min-w-0 flex-1 py-1 hover:text-accent">
                    <span className="block truncate font-medium">{s.protocol.title}</span>
                    <span className="text-sm text-muted">
                      {new Date(s.startedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })} · {count}{" "}
                      {count === 1 ? "entry" : "entries"}
                      {!s.endedAt && " · in progress"}
                    </span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Delete the session "${s.protocol.title}"? This removes its notebook entry from this browser.`)) {
                        useBenchStore.getState().deleteSession(s.id);
                      }
                    }}
                    className="min-h-11 rounded-lg px-3 text-sm text-muted hover:bg-surface-2 hover:text-bad"
                    aria-label={`Delete session ${s.protocol.title}`}
                  >
                    Delete
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}

function SampleCard({ def, label, highlight = false, onUse }: { def: SampleDef; label: string; highlight?: boolean; onUse: (d: SampleDef) => void }) {
  return (
    <button
      type="button"
      onClick={() => onUse(def)}
      className={`flex min-h-44 flex-col items-start gap-2 rounded-3xl border-2 bg-surface p-6 text-left hover:border-accent ${
        highlight ? "border-accent" : "border-border"
      }`}
    >
      <span className="text-xl font-semibold">{label}</span>
      <span className="text-muted">{def.blurb}</span>
      <span className="mt-auto font-mono text-sm text-muted">{def.steps.length} steps</span>
    </button>
  );
}

function PastePanel({ onClose, onParsed }: { onClose: () => void; onParsed: () => void }) {
  const [text, setText] = useState("");
  const [source, setSource] = useState<"pasted" | "uploaded">("pasted");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!/\.(txt|md|markdown)$/i.test(file.name) && !file.type.startsWith("text/")) {
      setError("Please choose a .txt or .md file.");
      return;
    }
    const content = await file.text();
    if (content.length > MAX_INPUT_CHARS) {
      setError(`That file is ${content.length.toLocaleString("en-US")} characters; the limit is ${MAX_INPUT_CHARS.toLocaleString("en-US")}.`);
      return;
    }
    setText(content);
    setSource("uploaded");
  }

  async function parse() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/parse-protocol", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, source }),
      });
      const body = (await res.json().catch(() => ({}))) as ParseResult & { error?: string };
      if (!res.ok || !body.protocol) throw new Error(body.error ?? `Parsing failed (${res.status}).`);
      useBenchStore.getState().setDraftFromParse(body);
      onParsed();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Parsing failed.");
      setBusy(false);
    }
  }

  const over = text.length > MAX_INPUT_CHARS;
  return (
    <section className="flex flex-col gap-4 rounded-3xl border border-border bg-surface p-6" aria-labelledby="paste-heading">
      <div className="flex items-center justify-between gap-3">
        <h2 id="paste-heading" className="text-xl font-semibold">
          Your protocol
        </h2>
        <button type="button" onClick={onClose} className="min-h-11 rounded-lg px-3 text-muted hover:bg-surface-2">
          Close
        </button>
      </div>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setSource("pasted");
        }}
        rows={12}
        placeholder={"Plasmid miniprep\n1. Pellet 1.5 mL of culture at 8,000 x g for 2 minutes.\n2. Resuspend in 250 µL buffer P1.\n…"}
        className="w-full rounded-2xl border border-border bg-bg p-4 font-mono text-sm leading-6"
        disabled={busy}
      />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={parse}
          disabled={busy || !text.trim() || over}
          className="min-h-14 rounded-2xl bg-accent px-6 text-lg font-semibold text-white disabled:opacity-40 dark:text-black"
        >
          {busy ? "Parsing…" : "Parse protocol"}
        </button>
        <input ref={fileRef} type="file" accept=".txt,.md,.markdown,text/plain,text/markdown" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="min-h-14 rounded-2xl border-2 border-border px-5 font-semibold disabled:opacity-40"
        >
          Upload .txt / .md
        </button>
        <span className={`ml-auto font-mono text-sm ${over ? "text-bad" : "text-muted"}`}>
          {text.length.toLocaleString("en-US")} / {MAX_INPUT_CHARS.toLocaleString("en-US")}
        </span>
      </div>
      {busy && <p className="text-sm text-muted">Splitting into steps with the AssemblyAI LLM Gateway. This can take up to half a minute.</p>}
      {error && <Banner tone="bad" title="Couldn't parse that">{error}</Banner>}
    </section>
  );
}
