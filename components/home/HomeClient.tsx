"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Banner } from "@/components/ui/Banner";
import { buttonClass } from "@/components/ui/button";
import { SiteHeader } from "@/components/ui/SiteHeader";
import { MAX_INPUT_CHARS } from "@/lib/protocol/schema";
import { SAMPLES, sampleToProtocol, type SampleDef } from "@/lib/protocol/samples";
import type { ParseResult } from "@/lib/protocol/types";
import { useBenchStore } from "@/lib/store/benchStore";
import { useHydratedBenchStore } from "@/lib/store/useHydrated";

/** Friendly names for the built-in protocols; the full titles still go in the notebook. */
const FRIENDLY: Record<string, { name: string; about: string; tag?: string }> = {
  "demo-mock": {
    name: "Practice run",
    about: "Eight easy steps with coloured water. No lab needed, so you can try it at your desk in about two minutes.",
    tag: "Start here",
  },
  miniprep: { name: "DNA miniprep", about: "A real lab recipe for pulling DNA out of bacteria, with volumes, spin speeds and wait times." },
  "pcr-setup": { name: "PCR setup", about: "Mixing the ingredients for a PCR, the reaction that copies a piece of DNA." },
};

const HOW = [
  { n: "1", title: "Pick your steps", body: "Choose a ready-made protocol or paste your own. BenchMate lays it out as clear, numbered steps you can check." },
  { n: "2", title: "Talk while you work", body: "Say “next”, read out a number, start a timer. BenchMate reads each step aloud and repeats back what it wrote down." },
  { n: "3", title: "Get your notes", body: "Say “I’m done” and your notebook entry is ready: every reading, change and note, in tidy tables." },
];

export function HomeClient() {
  const router = useRouter();
  const hydrated = useHydratedBenchStore();
  const sessions = useBenchStore((s) => s.sessions);
  const activeSessionId = useBenchStore((s) => s.activeSessionId);
  const storageError = useBenchStore((s) => s.storageError);
  const [showPaste, setShowPaste] = useState(false);
  const chooseRef = useRef<HTMLElement>(null);

  const active = sessions.find((s) => s.id === activeSessionId && !s.endedAt);
  const demo = SAMPLES.find((d) => d.id === "demo-mock") ?? SAMPLES[0];

  function pickSample(def: SampleDef) {
    const protocol = sampleToProtocol(def);
    useBenchStore.getState().setDraftFromParse({ protocol, source: "sample", missingNumbers: [] }, def.defaultSamples);
    router.push("/setup");
  }

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-20 px-4 pb-16 pt-14 sm:px-6 sm:pt-20">
        {/* Hero */}
        <section className="fade-up flex max-w-3xl flex-col gap-6">
          <p className="w-fit rounded-full border border-border bg-surface px-3 py-1 text-sm text-muted">A hands-free voice assistant for lab work</p>
          <h1 className="text-4xl font-semibold tracking-tight text-text sm:text-5xl">Hands busy? Just talk.</h1>
          <p className="text-xl leading-relaxed text-muted sm:text-2xl sm:leading-relaxed">
            BenchMate <span className="text-text">reads your lab steps out loud</span>, <span className="text-text">writes down what you say</span>,
            and turns it into a <span className="text-text">tidy notebook entry</span>, so your hands can stay on the work.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            {demo && (
              <button type="button" onClick={() => pickSample(demo)} className={buttonClass("primary", "lg")}>
                Try the practice run
              </button>
            )}
            <button
              type="button"
              onClick={() => chooseRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
              className={buttonClass("secondary", "lg")}
            >
              Choose a protocol
            </button>
            <Link href="/about" className={buttonClass("ghost", "lg")}>
              How it works →
            </Link>
          </div>
        </section>

        {(storageError || active) && (
          <div className="-mt-10 flex flex-col gap-3">
            {storageError && (
              <Banner tone="warn" title="Couldn't save to this browser">
                {storageError}
              </Banner>
            )}
            {active && (
              <Banner
                title={`You have a session in progress: ${active.protocol.title}`}
                action={
                  <Link href="/bench" className={buttonClass("primary", "md")}>
                    Continue
                  </Link>
                }
              >
                {active.currentStep > 0 ? `On step ${active.currentStep} of ${active.protocol.steps.length}` : "Not started yet"} ·{" "}
                {plural(active.entries.filter((e) => e.status !== "voided").length, "note")} so far
              </Banner>
            )}
          </div>
        )}

        {/* How it works */}
        <section aria-labelledby="how-heading" className="flex flex-col gap-6">
          <h2 id="how-heading" className="text-xl font-semibold text-text">
            How it works
          </h2>
          <ol className="grid gap-4 md:grid-cols-3">
            {HOW.map((h) => (
              <li key={h.n} className="flex flex-col gap-3 rounded-3xl border border-border bg-surface p-6">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-accent-soft font-semibold text-accent">{h.n}</span>
                <h3 className="text-lg font-semibold text-text">{h.title}</h3>
                <p className="text-muted">{h.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Choose */}
        <section ref={chooseRef} aria-labelledby="choose-heading" className="flex scroll-mt-6 flex-col gap-6">
          <div className="flex flex-col gap-1">
            <h2 id="choose-heading" className="text-xl font-semibold text-text">
              Choose a protocol
            </h2>
            <p className="text-muted">A protocol is a step-by-step recipe for a lab task. New here? Start with the practice run.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {SAMPLES.map((d) => (
              <SampleCard key={d.id} def={d} onUse={pickSample} />
            ))}
            <button
              type="button"
              onClick={() => setShowPaste(true)}
              aria-expanded={showPaste}
              className="group flex min-h-40 flex-col items-start gap-2 rounded-3xl border border-dashed border-border-strong bg-transparent p-6 text-left transition-colors hover:border-accent hover:bg-surface"
            >
              <span className="text-lg font-semibold text-text">Use your own protocol</span>
              <span className="text-muted">Paste text or upload a .txt or .md file. BenchMate splits it into steps and checks that no numbers went missing.</span>
              <span className="mt-auto text-sm text-accent group-hover:text-accent-strong">Paste or upload →</span>
            </button>
          </div>
          {showPaste && <PastePanel onClose={() => setShowPaste(false)} onParsed={() => router.push("/setup")} />}
        </section>

        {/* Past sessions */}
        <section aria-labelledby="recent-heading" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 id="recent-heading" className="text-xl font-semibold text-text">
              Your past sessions
            </h2>
            <p className="text-muted">Saved only in this browser.</p>
          </div>
          {!hydrated ? (
            <p className="text-muted">Loading…</p>
          ) : sessions.length === 0 ? (
            <p className="rounded-3xl border border-border bg-surface px-6 py-8 text-center text-muted">
              Nothing here yet. When you finish a session, its notebook entry will show up here.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {sessions.map((s) => {
                const count = s.entries.filter((e) => e.status !== "voided").length;
                const href = s.endedAt ? `/entry/${s.id}` : "/bench";
                return (
                  <li key={s.id} className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-5 py-3 transition-colors hover:border-border-strong">
                    <Link href={href} className="min-w-0 flex-1 py-1">
                      <span className="block truncate font-medium text-text">{s.protocol.title}</span>
                      <span className="text-sm text-muted">
                        {new Date(s.startedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })} · {plural(count, "note")}
                      </span>
                    </Link>
                    <span
                      className={`hidden shrink-0 rounded-full px-3 py-1 text-xs sm:inline ${s.endedAt ? "bg-surface-2 text-muted" : "bg-accent-soft text-accent"}`}
                    >
                      {s.endedAt ? "Finished" : "In progress"}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`Delete the session "${s.protocol.title}"? This removes its notebook entry from this browser.`)) {
                          useBenchStore.getState().deleteSession(s.id);
                        }
                      }}
                      className={buttonClass("ghost", "md", "text-sm hover:text-bad")}
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
    </>
  );
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function SampleCard({ def, onUse }: { def: SampleDef; onUse: (d: SampleDef) => void }) {
  const f = FRIENDLY[def.id];
  return (
    <button
      type="button"
      onClick={() => onUse(def)}
      className={`group flex min-h-40 flex-col items-start gap-2 rounded-3xl border bg-surface p-6 text-left transition-colors hover:border-accent ${
        f?.tag ? "border-accent/50" : "border-border"
      }`}
    >
      <span className="flex w-full items-center gap-3">
        <span className="text-lg font-semibold text-text">{f?.name ?? def.title}</span>
        {f?.tag && <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent">{f.tag}</span>}
      </span>
      <span className="text-muted">{f?.about ?? def.blurb}</span>
      <span className="mt-auto flex w-full items-center justify-between pt-2 text-sm">
        <span className="text-faint">{def.steps.length} steps</span>
        <span className="text-accent group-hover:text-accent-strong">Use this →</span>
      </span>
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
      if (!res.ok || !body.protocol) throw new Error(body.error ?? `Reading the protocol failed (${res.status}).`);
      useBenchStore.getState().setDraftFromParse(body);
      onParsed();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reading the protocol failed.");
      setBusy(false);
    }
  }

  const over = text.length > MAX_INPUT_CHARS;
  return (
    <section className="fade-up flex flex-col gap-4 rounded-3xl border border-border bg-surface p-6" aria-labelledby="paste-heading">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 id="paste-heading" className="text-lg font-semibold text-text">
            Your protocol
          </h3>
          <p className="text-sm text-muted">Paste it as you have it. Numbered steps work best, but plain paragraphs are fine.</p>
        </div>
        <button type="button" onClick={onClose} className={buttonClass("ghost", "md")}>
          Close
        </button>
      </div>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setSource("pasted");
        }}
        rows={10}
        placeholder={"Plasmid miniprep\n1. Pellet 1.5 mL of culture at 8,000 x g for 2 minutes.\n2. Resuspend in 250 µL buffer P1.\n…"}
        className="w-full rounded-2xl border border-border bg-bg p-4 font-mono text-sm leading-6 text-text placeholder:text-faint"
        disabled={busy}
      />
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={parse} disabled={busy || !text.trim() || over} className={buttonClass("primary", "lg")}>
          {busy ? "Reading your steps…" : "Turn into steps"}
        </button>
        <input ref={fileRef} type="file" accept=".txt,.md,.markdown,text/plain,text/markdown" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className={buttonClass("secondary", "lg")}>
          Upload a file
        </button>
        <span className={`ml-auto font-mono text-sm ${over ? "text-bad" : "text-faint"}`}>
          {text.length.toLocaleString("en-US")} / {MAX_INPUT_CHARS.toLocaleString("en-US")}
        </span>
      </div>
      {busy && <p className="text-sm text-muted">This can take up to half a minute.</p>}
      {error && (
        <Banner tone="bad" title="Couldn't read that">
          {error}
        </Banner>
      )}
    </section>
  );
}
