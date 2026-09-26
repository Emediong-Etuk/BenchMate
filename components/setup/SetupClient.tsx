"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Banner } from "@/components/ui/Banner";
import { formatSampleList, parseSamples } from "@/lib/agent/format";
import { buildKeyterms } from "@/lib/agent/keyterms";
import { useBenchStore } from "@/lib/store/benchStore";
import { useHydratedBenchStore } from "@/lib/store/useHydrated";
import { KeytermChips } from "./KeytermChips";
import { MicCheck } from "./MicCheck";
import { StepEditor } from "./StepEditor";

export function SetupClient() {
  const router = useRouter();
  const hydrated = useHydratedBenchStore();
  const draft = useBenchStore((s) => s.draft);
  const researcherName = useBenchStore((s) => s.researcherName);
  const settings = useBenchStore((s) => s.settings);
  const activeSession = useBenchStore((s) => s.sessions.find((x) => x.id === s.activeSessionId && !x.endedAt));
  const store = useBenchStore.getState;

  if (!hydrated) return <main className="p-8 text-muted">Loading…</main>;
  if (!draft) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-6 py-16">
        <h1 className="text-2xl font-semibold">No protocol loaded</h1>
        <p className="text-muted">Pick a sample or paste your own protocol first.</p>
        <Link href="/" className="inline-flex min-h-14 w-fit items-center rounded-2xl bg-accent px-6 font-semibold text-white dark:text-black">
          Choose a protocol
        </Link>
      </main>
    );
  }

  const { protocol } = draft;
  const samples = parseSamples(draft.samplesInput);
  const mergedKeyterms = buildKeyterms({ samples, protocolKeyterms: protocol.keyterms });
  const emptySteps = protocol.steps.filter((s) => !s.text.trim()).length;
  const usableSteps = protocol.steps.length - emptySteps;

  function start() {
    // Blank steps are dropped rather than read aloud as silence.
    const s = store();
    const d = s.draft;
    if (!d) return;
    s.setDraftProtocol({ ...d.protocol, steps: d.protocol.steps.filter((st) => st.text.trim()) });
    const id = s.startSession();
    if (id) router.push("/bench");
  }

  return (
    <main className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="flex min-w-0 flex-col gap-5">
        <nav className="text-sm text-muted">
          <Link href="/" className="hover:text-accent">
            ← Protocols
          </Link>
        </nav>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold uppercase tracking-wide text-muted">Protocol title</span>
          <input
            value={protocol.title}
            onChange={(e) => store().setDraftProtocol({ ...protocol, title: e.target.value })}
            className="min-h-14 rounded-2xl border border-border bg-surface px-4 text-2xl font-semibold"
          />
        </label>

        {draft.missingNumbers.length > 0 && (
          <Banner
            tone="warn"
            title="Some values may have been lost in parsing"
            action={
              <button type="button" onClick={() => store().dismissMissingNumbers()} className="min-h-11 rounded-xl border border-border px-4 text-sm font-semibold">
                I checked
              </button>
            }
          >
            These values from your text weren&apos;t found in the parsed steps:{" "}
            <span className="font-mono font-semibold text-text">{draft.missingNumbers.join(", ")}</span>. Please check the steps below.
          </Banner>
        )}
        {draft.parseSource === "fallback" && (
          <Banner tone="info" title="Parsed with the basic rule-based parser">
            {draft.note ? `${draft.note} ` : ""}Steps were split on numbering or blank lines. Check the split, and add keyterms and durations by hand.
          </Banner>
        )}
        {draft.parseSource === "llm" && (
          <p className="text-sm text-muted">Parsed with the AssemblyAI LLM Gateway. Check every step before you start: the notebook will quote them.</p>
        )}

        <StepEditor steps={protocol.steps} onChange={(steps) => store().setDraftProtocol({ ...protocol, steps })} />
      </div>

      <aside className="flex flex-col gap-6 lg:sticky lg:top-6 lg:self-start">
        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
          <label className="flex flex-col gap-1">
            <span className="font-semibold">Samples in this run</span>
            <input
              value={draft.samplesInput}
              onChange={(e) => store().setDraftSamples(e.target.value)}
              placeholder="e.g. 1-8, control, blank"
              className="min-h-12 rounded-xl border border-border bg-bg px-3"
            />
          </label>
          <p className="text-sm text-muted">
            {samples.length ? (
              <>
                <span className="font-mono text-text">{formatSampleList(samples)}</span> ({samples.length} {samples.length === 1 ? "sample" : "samples"})
              </>
            ) : (
              "Optional. BenchMate warns when you log a sample that isn't in this list."
            )}
          </p>
          <label className="flex flex-col gap-1">
            <span className="font-semibold">Researcher</span>
            <input
              value={researcherName}
              onChange={(e) => store().setResearcherName(e.target.value)}
              placeholder="Optional, stored only in this browser"
              className="min-h-12 rounded-xl border border-border bg-bg px-3"
            />
          </label>
        </section>

        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
          <h2 className="font-semibold">Speech keyterms</h2>
          <KeytermChips terms={protocol.keyterms} mergedCount={mergedKeyterms.length} onChange={(keyterms) => store().setDraftProtocol({ ...protocol, keyterms })} />
        </section>

        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
          <h2 className="font-semibold">Mic check</h2>
          <MicCheck autoGainControl={settings.autoGainControl} volume={settings.volume} />
        </section>

        {activeSession && (
          <Banner tone="warn" title="A session is already in progress">
            Starting a new one leaves &ldquo;{activeSession.protocol.title}&rdquo; unfinished in your recent sessions.
          </Banner>
        )}

        <button
          type="button"
          onClick={start}
          disabled={usableSteps === 0}
          className="min-h-20 rounded-3xl bg-accent px-6 text-xl font-semibold text-white shadow-sm disabled:opacity-40 dark:text-black"
        >
          Start at the bench →
        </button>
        <p className="-mt-3 text-center text-sm text-muted">
          {usableSteps} {usableSteps === 1 ? "step" : "steps"}
          {emptySteps > 0 && ` · ${emptySteps} empty ${emptySteps === 1 ? "step" : "steps"} will be skipped`}
        </p>
      </aside>
    </main>
  );
}
