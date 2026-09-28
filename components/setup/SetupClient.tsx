"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Banner } from "@/components/ui/Banner";
import { buttonClass } from "@/components/ui/button";
import { SiteHeader } from "@/components/ui/SiteHeader";
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

  if (!hydrated)
    return (
      <>
        <SiteHeader />
        <main className="p-8 text-muted">Loading…</main>
      </>
    );
  if (!draft) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-6 py-20">
          <h1 className="text-2xl font-semibold">No protocol chosen yet</h1>
          <p className="text-muted">Pick the practice run or one of the protocols on the home screen first.</p>
          <Link href="/" className={buttonClass("primary", "lg", "w-fit")}>
            Choose a protocol
          </Link>
        </main>
      </>
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
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 pb-16 pt-10 sm:px-6">
        <header className="fade-up flex flex-col gap-3">
          <Link href="/" className="w-fit text-sm text-muted hover:text-text">
            ← Back to protocols
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight">Get ready</h1>
          <p className="max-w-2xl text-lg text-muted">
            Three quick checks and you&apos;re set. Nothing here is required except the steps themselves.
          </p>
        </header>

        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_24rem]">
          {/* 1. Steps */}
          <section className="flex min-w-0 flex-col gap-5" aria-labelledby="steps-heading">
            <StageHeading n={1} id="steps-heading" title="Check the steps">
              BenchMate reads these out word for word. Fix anything that looks wrong.
            </StageHeading>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm text-muted">Protocol name</span>
              <input
                value={protocol.title}
                onChange={(e) => store().setDraftProtocol({ ...protocol, title: e.target.value })}
                className="min-h-13 rounded-2xl border border-border bg-surface px-4 text-xl font-semibold text-text"
              />
            </label>

            {draft.missingNumbers.length > 0 && (
              <Banner
                tone="warn"
                title="A few numbers may have gone missing"
                action={
                  <button type="button" onClick={() => store().dismissMissingNumbers()} className={buttonClass("secondary", "md")}>
                    I checked
                  </button>
                }
              >
                These values from your text weren&apos;t found in the steps:{" "}
                <span className="font-mono font-semibold text-text">{draft.missingNumbers.join(", ")}</span>. Please look them over below.
              </Banner>
            )}
            {draft.parseSource === "fallback" && (
              <Banner title="Split by numbering and blank lines">
                {draft.note ? `${draft.note} ` : ""}Check that each step is split where you expect, and add times by hand if needed.
              </Banner>
            )}

            <StepEditor steps={protocol.steps} onChange={(steps) => store().setDraftProtocol({ ...protocol, steps })} />
          </section>

          <aside className="flex flex-col gap-8 lg:sticky lg:top-6 lg:self-start">
            {/* 2. Details */}
            <section className="flex flex-col gap-4" aria-labelledby="details-heading">
              <StageHeading n={2} id="details-heading" title="A few details">
                Optional. They make the notebook entry more complete.
              </StageHeading>
              <div className="flex flex-col gap-4 rounded-3xl border border-border bg-surface p-5">
                <label className="flex flex-col gap-1.5">
                  <span className="font-medium text-text">Which samples are you working with?</span>
                  <input
                    value={draft.samplesInput}
                    onChange={(e) => store().setDraftSamples(e.target.value)}
                    placeholder="e.g. 1-8, control, blank"
                    className="min-h-12 rounded-xl border border-border bg-bg px-3 text-text placeholder:text-faint"
                  />
                  <span className="text-sm text-muted">
                    {samples.length ? (
                      <>
                        {formatSampleList(samples)} ({samples.length} {samples.length === 1 ? "sample" : "samples"})
                      </>
                    ) : (
                      "Usually numbered tubes. BenchMate mentions it if you record one that isn't on this list."
                    )}
                  </span>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="font-medium text-text">Your name</span>
                  <input
                    value={researcherName}
                    onChange={(e) => store().setResearcherName(e.target.value)}
                    placeholder="Shown on the notebook entry"
                    className="min-h-12 rounded-xl border border-border bg-bg px-3 text-text placeholder:text-faint"
                  />
                </label>
                <details className="group rounded-xl border border-border bg-bg/50 px-4 py-3">
                  <summary className="cursor-pointer list-none text-sm font-medium text-muted marker:hidden hover:text-text">
                    <span className="mr-1 inline-block transition-transform group-open:rotate-90">›</span> Unusual words BenchMate should listen for
                  </summary>
                  <div className="mt-3">
                    <KeytermChips
                      terms={protocol.keyterms}
                      mergedCount={mergedKeyterms.length}
                      onChange={(keyterms) => store().setDraftProtocol({ ...protocol, keyterms })}
                    />
                  </div>
                </details>
              </div>
            </section>

            {/* 3. Sound */}
            <section className="flex flex-col gap-4" aria-labelledby="sound-heading">
              <StageHeading n={3} id="sound-heading" title="Sound check">
                Stand where you&apos;ll work and make sure you can hear each other.
              </StageHeading>
              <div className="rounded-3xl border border-border bg-surface p-5">
                <MicCheck autoGainControl={settings.autoGainControl} volume={settings.volume} />
              </div>
            </section>

            {activeSession && (
              <Banner tone="warn" title="Another session is still open">
                Starting this one leaves &ldquo;{activeSession.protocol.title}&rdquo; unfinished in your past sessions.
              </Banner>
            )}

            <div className="flex flex-col gap-2">
              <button type="button" onClick={start} disabled={usableSteps === 0} className={buttonClass("primary", "xl", "w-full rounded-3xl")}>
                Start at the bench →
              </button>
              <p className="text-center text-sm text-muted">
                {usableSteps} {usableSteps === 1 ? "step" : "steps"}
                {emptySteps > 0 && ` · ${emptySteps} empty ${emptySteps === 1 ? "step" : "steps"} will be skipped`}
              </p>
            </div>
          </aside>
        </div>
      </main>
    </>
  );
}

function StageHeading({ n, id, title, children }: { n: number; id: string; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-soft text-sm font-semibold text-accent">{n}</span>
      <div className="flex flex-col gap-0.5">
        <h2 id={id} className="text-lg font-semibold text-text">
          {title}
        </h2>
        <p className="text-[15px] text-muted">{children}</p>
      </div>
    </div>
  );
}
