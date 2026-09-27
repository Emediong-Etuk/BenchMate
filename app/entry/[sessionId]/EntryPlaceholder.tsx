"use client";

import Link from "next/link";
import { LogFeed } from "@/components/bench/LogFeed";
import { useBenchStore } from "@/lib/store/benchStore";
import { useHydratedBenchStore } from "@/lib/store/useHydrated";

export function EntryPlaceholder({ sessionId }: { sessionId: string }) {
  const hydrated = useHydratedBenchStore();
  const session = useBenchStore((s) => s.sessions.find((x) => x.id === sessionId));
  if (!hydrated) return <main className="p-8 text-muted">Loading…</main>;
  if (!session) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-2xl font-semibold">Session not found</h1>
        <Link href="/" className="text-accent underline">
          Home
        </Link>
      </main>
    );
  }
  const live = session.entries.filter((e) => e.status !== "voided");
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10">
      <Link href="/" className="text-sm text-muted hover:text-accent">
        ← Home
      </Link>
      <h1 className="text-3xl font-semibold">{session.protocol.title}</h1>
      <p className="text-muted">
        {session.endedAt ? "Session ended" : "Session in progress"} · {live.length} entries · {session.transcript.length} transcript lines. The full notebook entry
        arrives in Phase 5.
      </p>
      <LogFeed entries={session.entries} />
    </main>
  );
}
