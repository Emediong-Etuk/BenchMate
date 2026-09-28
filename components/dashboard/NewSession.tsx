"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Banner } from "@/components/ui/Banner";
import { buttonClass } from "@/components/ui/button";
import { MAX_INPUT_CHARS } from "@/lib/protocol/schema";
import { SAMPLES, sampleToProtocol, type SampleDef } from "@/lib/protocol/samples";
import type { ParseResult } from "@/lib/protocol/types";
import { useBenchStore } from "@/lib/store/benchStore";

/** Friendly names for the built-in protocols; the full titles still go in the notebook. */
export const FRIENDLY: Record<string, { name: string; about: string; tag?: string }> = {
  "demo-mock": {
    name: "Practice run",
    about: "Eight easy steps with coloured water. No lab needed, so you can try it at your desk in about two minutes.",
    tag: "Start here",
  },
  miniprep: { name: "DNA miniprep", about: "A real lab recipe for pulling DNA out of bacteria, with volumes, spin speeds and wait times." },
  "pcr-setup": { name: "PCR setup", about: "Mixing the ingredients for a PCR, the reaction that copies a piece of DNA." },
};

/** "Start something new": the built-in protocols plus paste/upload. */
export function NewSession({ autoStart }: { autoStart?: string | null }) {
  const router = useRouter();
  const [showPaste, setShowPaste] = useState(false);
  // Account data must finish loading first, or it would replace the new draft.
  const ready = useBenchStore((s) => s.hydrated);

  function pickSample(def: SampleDef) {
    if (!useBenchStore.getState().hydrated) return;
    const protocol = sampleToProtocol(def);
    useBenchStore.getState().setDraftFromParse({ protocol, source: "sample", missingNumbers: [] }, def.defaultSamples);
    router.push("/setup");
  }

  // "Try the practice run" from the landing page lands here after sign-in.
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !autoStart || !ready) return;
    const def = SAMPLES.find((d) => d.id === autoStart);
    if (!def) return;
    started.current = true;
    pickSample(def);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once for the query param
  }, [autoStart, ready]);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {SAMPLES.map((d) => (
          <SampleCard key={d.id} def={d} onUse={pickSample} disabled={!ready} />
        ))}
        <button
          type="button"
          onClick={() => setShowPaste(true)}
          disabled={!ready}
          aria-expanded={showPaste}
          className="group flex min-h-40 flex-col items-start gap-2 rounded-3xl border border-dashed border-border-strong bg-transparent p-6 text-left transition-colors hover:border-accent hover:bg-surface"
        >
          <span className="text-lg font-semibold text-text">Use your own protocol</span>
          <span className="text-muted">Paste text or upload a .txt or .md file. BenchMate splits it into steps and checks that no numbers went missing.</span>
          <span className="mt-auto text-sm text-accent group-hover:text-accent-strong">Paste or upload →</span>
        </button>
      </div>
      {showPaste && <PastePanel onClose={() => setShowPaste(false)} onParsed={() => router.push("/setup")} />}
    </div>
  );
}

function SampleCard({ def, onUse, disabled }: { def: SampleDef; onUse: (d: SampleDef) => void; disabled?: boolean }) {
  const f = FRIENDLY[def.id];
  return (
    <button
      type="button"
      onClick={() => onUse(def)}
      disabled={disabled}
      className={`group disabled:cursor-wait disabled:opacity-60 flex min-h-40 flex-col items-start gap-2 rounded-3xl border bg-surface p-6 text-left transition-colors hover:border-accent ${
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
