"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";
import { signOutAndForget } from "@/components/auth/authActions";
import { Banner } from "@/components/ui/Banner";
import { buttonClass } from "@/components/ui/button";
import { Avatar, SiteHeader } from "@/components/ui/SiteHeader";
import { useBenchStore } from "@/lib/store/benchStore";
import type { BenchSession } from "@/lib/store/types";
import { useHydratedBenchStore } from "@/lib/store/useHydrated";
import { NewSession } from "./NewSession";

type Summary = { id: string; title: string; startedAt: string; endedAt: string | null; entryCount: number };

function summarize(s: BenchSession): Summary {
  return {
    id: s.id,
    title: s.protocol.title,
    startedAt: s.startedAt,
    endedAt: s.endedAt ?? null,
    entryCount: s.entries.filter((e) => e.status !== "voided").length,
  };
}

export function DashboardClient({ autoStart }: { autoStart: string | null }) {
  const hydrated = useHydratedBenchStore();
  const { data: auth } = useSession();
  const sessions = useBenchStore((s) => s.sessions);
  const activeSessionId = useBenchStore((s) => s.activeSessionId);
  const loadError = useBenchStore((s) => s.loadError);
  const storageError = useBenchStore((s) => s.storageError);
  const [remote, setRemote] = useState<Summary[] | null>(null);
  const [listError, setListError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/sessions", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ sessions: Summary[] }>) : Promise.reject(new Error(String(r.status)))))
      .then((b) => !cancelled && setRemote(b.sessions))
      .catch(() => !cancelled && setListError(true));
    return () => {
      cancelled = true;
    };
  }, []);

  // Account list, overlaid with what's in memory (newer, possibly not saved yet).
  const all = useMemo(() => {
    const byId = new Map((remote ?? []).map((s) => [s.id, s]));
    for (const s of sessions) byId.set(s.id, summarize(s));
    return [...byId.values()].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
  }, [remote, sessions]);

  const active = sessions.find((s) => s.id === activeSessionId && !s.endedAt);
  const firstName = (auth?.user?.name ?? "").split(" ")[0] || "there";
  const totals = useMemo(() => {
    let seconds = 0;
    for (const s of all) if (s.endedAt) seconds += Math.max(0, (Date.parse(s.endedAt) - Date.parse(s.startedAt)) / 1000);
    return {
      sessions: all.length,
      finished: all.filter((s) => s.endedAt).length,
      entries: all.reduce((n, s) => n + s.entryCount, 0),
      time: formatHours(seconds),
    };
  }, [all]);
  const isNew = hydrated && remote !== null && all.length === 0;

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-14 px-4 pb-16 pt-10 sm:px-6">
        <header className="fade-up flex flex-wrap items-center gap-5">
          <Avatar name={auth?.user?.name ?? "?"} image={auth?.user?.image ?? null} size={56} />
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-semibold tracking-tight">{isNew ? `Welcome to BenchMate, ${firstName}` : `Welcome back, ${firstName}`}</h1>
            <p className="text-muted">
              {isNew ? "Your account is ready. Start with the practice run to see how it works." : "Everything here is private to your account."}
            </p>
          </div>
        </header>

        {(loadError || storageError) && (
          <div className="-mt-6 flex flex-col gap-3">
            {loadError && <Banner tone="warn">{loadError}</Banner>}
            {storageError && <Banner tone="warn">{storageError}</Banner>}
          </div>
        )}

        {active && (
          <section className="-mt-4 flex flex-wrap items-center gap-5 rounded-3xl border border-accent/30 bg-accent-soft/50 p-6">
            <span className="h-3 w-3 shrink-0 rounded-full bg-accent pulse-ring text-accent" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-text">Session in progress: {active.protocol.title}</p>
              <p className="text-muted">
                {active.currentStep > 0 ? `Step ${active.currentStep} of ${active.protocol.steps.length}` : "Not started yet"} ·{" "}
                {plural(active.entries.filter((e) => e.status !== "voided").length, "note")} recorded
              </p>
            </div>
            <Link href="/bench" className={buttonClass("primary", "lg")}>
              Continue
            </Link>
          </section>
        )}

        {!isNew && (
          <section aria-label="Your activity" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Sessions" value={totals.sessions} />
            <Stat label="Finished" value={totals.finished} />
            <Stat label="Notes recorded" value={totals.entries} hint="Readings, changes and notes" />
            <Stat label="Time at the bench" value={totals.time} />
          </section>
        )}

        <section aria-labelledby="new-heading" className="flex flex-col gap-5">
          <div>
            <h2 id="new-heading" className="text-xl font-semibold text-text">
              Start something new
            </h2>
            <p className="text-muted">A protocol is a step-by-step recipe for a lab task. New here? Start with the practice run.</p>
          </div>
          <NewSession autoStart={autoStart} />
        </section>

        <section aria-labelledby="sessions-heading" className="flex flex-col gap-4">
          <div>
            <h2 id="sessions-heading" className="text-xl font-semibold text-text">
              Your sessions
            </h2>
            <p className="text-muted">Open one to see, copy or print its notebook entry.</p>
          </div>
          {listError && remote === null && <Banner tone="warn">Couldn&apos;t load your full session list. Showing what&apos;s loaded so far.</Banner>}
          {!hydrated && remote === null ? (
            <p className="text-muted">Loading…</p>
          ) : all.length === 0 ? (
            <p className="rounded-3xl border border-border bg-surface px-6 py-8 text-center text-muted">
              No sessions yet. When you finish one, its notebook entry shows up here.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {all.map((s) => (
                <SessionRow
                  key={s.id}
                  s={s}
                  onDelete={() => {
                    if (!window.confirm(`Delete "${s.title}"? This permanently removes the session and its notebook entry from your account.`)) return;
                    useBenchStore.getState().deleteSession(s.id);
                    setRemote((r) => r?.filter((x) => x.id !== s.id) ?? r);
                  }}
                />
              ))}
            </ul>
          )}
        </section>

        <AccountSection name={auth?.user?.name ?? ""} email={auth?.user?.email ?? ""} image={auth?.user?.image ?? null} />
      </main>
    </>
  );
}

function SessionRow({ s, onDelete }: { s: Summary; onDelete: () => void }) {
  const href = s.endedAt ? `/entry/${encodeURIComponent(s.id)}` : "/bench";
  return (
    <li className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-5 py-3 transition-colors hover:border-border-strong">
      <Link href={href} className="min-w-0 flex-1 py-1">
        <span className="block truncate font-medium text-text">{s.title}</span>
        <span className="text-sm text-muted">
          {new Date(s.startedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })} · {plural(s.entryCount, "note")}
        </span>
      </Link>
      <span className={`hidden shrink-0 rounded-full px-3 py-1 text-xs sm:inline ${s.endedAt ? "bg-surface-2 text-muted" : "bg-accent-soft text-accent"}`}>
        {s.endedAt ? "Finished" : "In progress"}
      </span>
      <button type="button" onClick={onDelete} className={buttonClass("ghost", "md", "text-sm hover:text-bad")} aria-label={`Delete session ${s.title}`}>
        Delete
      </button>
    </li>
  );
}

function AccountSection({ name, email, image }: { name: string; email: string; image: string | null }) {
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function deleteAccount() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/me", { method: "DELETE" });
      if (!res.ok) throw new Error(String(res.status));
      await signOutAndForget();
    } catch {
      setError("Couldn't delete your account. Please try again.");
      setBusy(false);
    }
  }

  return (
    <section id="account" aria-labelledby="account-heading" className="flex scroll-mt-6 flex-col gap-4">
      <h2 id="account-heading" className="text-xl font-semibold text-text">
        Account
      </h2>
      <div className="flex flex-col gap-5 rounded-3xl border border-border bg-surface p-6">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar name={name || email || "?"} image={image} size={48} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-text">{name || "Your account"}</p>
            <p className="truncate text-sm text-muted">{email} · signed in with Google</p>
          </div>
          <button type="button" onClick={() => void signOutAndForget()} className={buttonClass("secondary", "md")}>
            Sign out
          </button>
        </div>
        <div className="border-t border-border pt-5">
          <p className="font-medium text-text">Delete account</p>
          <p className="text-[15px] text-muted">Permanently deletes your account and every session and notebook entry in it. This can&apos;t be undone.</p>
          {!confirming ? (
            <button type="button" onClick={() => setConfirming(true)} className={buttonClass("danger", "md", "mt-3")}>
              Delete my account
            </button>
          ) : (
            <form
              className="mt-3 flex flex-wrap items-center gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (typed.trim().toLowerCase() === "delete") void deleteAccount();
              }}
            >
              <label className="flex flex-col gap-1 text-sm text-muted">
                Type &ldquo;delete&rdquo; to confirm
                <input
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  autoFocus
                  className="min-h-11 rounded-xl border border-border bg-bg px-3 text-text"
                  aria-label="Type delete to confirm"
                />
              </label>
              <button type="submit" disabled={busy || typed.trim().toLowerCase() !== "delete"} className={buttonClass("danger", "md", "self-end")}>
                {busy ? "Deleting…" : "Delete everything"}
              </button>
              <button type="button" onClick={() => setConfirming(false)} className={buttonClass("ghost", "md", "self-end")}>
                Cancel
              </button>
            </form>
          )}
          {error && (
            <p role="alert" className="mt-2 text-sm text-bad">
              {error}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-3xl border border-border bg-surface p-5" title={hint}>
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums text-text">{value}</p>
    </div>
  );
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function formatHours(seconds: number): string {
  if (seconds < 60) return seconds > 0 ? "< 1 min" : "0 min";
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min`;
}
