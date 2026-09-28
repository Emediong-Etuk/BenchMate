"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { buildEntryModel, type Table } from "@/lib/notebook/entryModel";
import { exportFileBase, generateJson, renderMarkdown } from "@/lib/notebook/generateEntry";
import { buttonClass } from "@/components/ui/button";
import { SiteHeader } from "@/components/ui/SiteHeader";
import { useBenchStore } from "@/lib/store/benchStore";
import { useHydratedBenchStore } from "@/lib/store/useHydrated";

function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for browsers/contexts without the async clipboard API.
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

/** Generated notebook entry + exports (brief §12, §13). */
export function EntryClient({ sessionId }: { sessionId: string }) {
  const hydrated = useHydratedBenchStore();
  const session = useBenchStore((s) => s.sessions.find((x) => x.id === sessionId));
  const activeId = useBenchStore((s) => s.activeSessionId);
  const [copied, setCopied] = useState<"idle" | "ok" | "fail">("idle");
  const [lookup, setLookup] = useState<"loading" | "ok" | "missing" | "error">("loading");
  const model = useMemo(() => (session ? buildEntryModel(session) : null), [session]);

  // Older sessions aren't kept in memory; fetch this one from the account.
  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    void useBenchStore
      .getState()
      .loadSession(sessionId)
      .then((r) => !cancelled && setLookup(r));
    return () => {
      cancelled = true;
    };
  }, [hydrated, sessionId]);

  if (!hydrated || (!session && lookup === "loading"))
    return (
      <>
        <SiteHeader />
        <main className="p-8 text-muted">Loading…</main>
      </>
    );
  if (!session || !model) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto flex max-w-2xl flex-col gap-4 px-6 py-20">
          <h1 className="text-2xl font-semibold">{lookup === "error" ? "Couldn't load this entry" : "Notebook entry not found"}</h1>
          <p className="text-muted">
            {lookup === "error"
              ? "Check your connection and try again."
              : "It may have been deleted, or it belongs to a different account."}
          </p>
          <Link href="/dashboard" className={buttonClass("primary", "lg", "w-fit")}>
            Back to your dashboard
          </Link>
        </main>
      </>
    );
  }

  const markdown = renderMarkdown(model);
  const base = exportFileBase(session);
  const s = model.summary;

  return (
    <>
    <SiteHeader />
    <main className="entry-page mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 pb-16 pt-10 sm:px-6">
      <div className="no-print fade-up flex flex-col gap-4 rounded-3xl border border-accent/30 bg-accent-soft/50 p-6">
        <div>
          <p className="font-semibold text-text">{session.endedAt ? "Your notebook entry is ready." : "This session is still in progress."}</p>
          <p className="text-muted">
            {session.endedAt
              ? "It's built straight from what you recorded and saved privately to your account."
              : "What you see below is the entry so far."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!session.endedAt && session.id === activeId && (
            <Link href="/bench" className={buttonClass("primary", "md")}>
              Back to the session
            </Link>
          )}
          <ActionButton
            onClick={async () => {
              setCopied((await copyText(markdown)) ? "ok" : "fail");
              setTimeout(() => setCopied("idle"), 2500);
            }}
          >
            {copied === "ok" ? "Copied ✓" : copied === "fail" ? "Copy failed" : "Copy Markdown"}
          </ActionButton>
          <ActionButton onClick={() => download(`${base}.md`, markdown, "text/markdown;charset=utf-8")}>Download .md</ActionButton>
          <ActionButton onClick={() => download(`${base}.json`, generateJson(session), "application/json")}>Download JSON</ActionButton>
          <ActionButton onClick={() => window.print()} primary>
            Print / Save as PDF
          </ActionButton>
        </div>
      </div>

      <header className="flex flex-col gap-3">
        <p className="text-sm font-medium text-accent">Notebook entry</p>
        <h1 className="text-3xl font-semibold tracking-tight text-text sm:text-4xl">{model.title}</h1>
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-[15px] text-muted">
          <Meta label="Date" value={model.header.date} />
          <Meta label="Researcher" value={model.header.researcher} />
          <Meta label="Duration" value={model.header.duration} />
          <Meta label="Started" value={model.header.started} />
          <Meta label="Ended" value={model.header.ended} />
          <Meta label="Samples" value={model.header.samples} />
          <Meta label="Generated by" value="BenchMate (voice session)" />
        </dl>
      </header>

      <section aria-label="Summary" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Steps completed" value={`${s.stepsCompleted} / ${s.totalSteps}`} />
        <Stat label="Measurements" value={s.measurements} />
        <Stat label="Deviations" value={s.deviations} tone={s.deviations ? "warn" : undefined} />
        <Stat label="Observations" value={s.observations} />
        <Stat label="Voided" value={s.voided} />
        <Stat label="Not read back" value={s.unconfirmed} tone={s.unconfirmed ? "warn" : undefined} />
      </section>

      <Section title="Deviations" hint="Changes from the plan">
        <EntryTable table={model.deviations} />
      </Section>
      <Section title="Measurements" hint="Readings you called out">
        <EntryTable table={model.measurements} monoCols={[2]} />
      </Section>
      <Section title="Observations" hint="Things you noticed">
        <EntryTable table={model.observations} />
      </Section>
      {model.hasUnconfirmedInTables && (
        <p className="-mt-4 text-sm text-warn">† Not read back to the researcher (the reply was interrupted). Check before relying on it.</p>
      )}
      <Section title="Step log">
        <EntryTable table={model.stepLog} />
      </Section>
      <Section title="Timers">
        <EntryTable table={model.timers} />
      </Section>

      <Section title="Audit" hint="Nothing is deleted: corrections and their sources are kept here">
        <h3 className="font-semibold text-text">Crossed-out (voided) entries</h3>
        <EntryTable table={model.voided} strike />
        <h3 className="mt-4 font-semibold text-text">Entries not read back</h3>
        <EntryTable table={model.unconfirmed} />
        <h3 className="mt-4 font-semibold text-text">What was said for each entry</h3>
        {model.sourceUtterances.length ? (
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {model.sourceUtterances.map((u, i) => (
              <li key={i}>{u}</li>
            ))}
          </ul>
        ) : (
          <p className="text-muted">None.</p>
        )}
      </Section>

      <Section title="Appendix: full transcript">
        {model.transcript.length ? (
          <ol className="transcript max-h-96 overflow-y-auto rounded-2xl border border-border bg-surface p-5 font-mono text-sm leading-6 text-muted">
            {model.transcript.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ol>
        ) : (
          <p className="text-muted">No transcript.</p>
        )}
      </Section>

      <footer className="flex flex-col gap-3 border-t border-border pt-4 text-sm text-muted">
        <p>AssemblyAI session IDs: {model.sessionIds.length ? model.sessionIds.join(", ") : "—"}</p>
        <div>
          <p className="font-semibold text-text">Protocol snapshot</p>
          <ol className="mt-1 space-y-0.5">
            {model.protocolSnapshot.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ol>
        </div>
      </footer>
    </main>
    </>
  );
}

function ActionButton({ children, onClick, primary }: { children: React.ReactNode; onClick: () => void; primary?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={buttonClass(primary ? "primary" : "secondary", "md")}
    >
      {children}
    </button>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1.5">
      <dt className="text-faint">{label}</dt>
      <dd className="text-text">{value}</dd>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: "warn" }) {
  return (
    <div className={`stat rounded-2xl border bg-surface p-4 ${tone === "warn" ? "border-warn/50" : "border-border"}`}>
      <p className="text-sm text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone === "warn" ? "text-warn" : "text-text"}`}>{value}</p>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-xl font-semibold text-text">{title}</h2>
        {hint && <p className="text-sm text-muted">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function EntryTable({ table, monoCols = [], strike = false }: { table: Table; monoCols?: number[]; strike?: boolean }) {
  if (table.rows.length === 0) return <p className="text-faint">None.</p>;
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-surface-2">
          <tr>
            {table.headers.map((h) => (
              <th key={h} scope="col" className="whitespace-nowrap px-4 py-2.5 font-medium text-muted">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, i) => (
            <tr key={i} className="border-t border-border">
              {row.map((c, j) => (
                <td key={j} className={`px-4 py-2.5 align-top text-text ${monoCols.includes(j) ? "font-mono" : ""} ${strike && j === 2 ? "line-through opacity-70" : ""}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
