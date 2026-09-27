"use client";

import Link from "next/link";
import { useEffect } from "react";

// Route-level error boundary: a calm message, never a stack trace (brief §17
// Phase 6). Lab data lives in localStorage, so it survives a crash.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[BenchMate] page error:", error);
  }, [error]);
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-5 px-6 py-16">
      <h1 className="text-3xl font-semibold">Something went wrong on this screen</h1>
      <p className="text-lg text-muted">
        Your protocol, log and notebook entries are saved in this browser and are not lost. Try again, or go back to the home screen and resume your session.
      </p>
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={reset} className="min-h-14 rounded-2xl bg-accent px-6 text-lg font-semibold text-white dark:text-black">
          Try again
        </button>
        <Link href="/" className="inline-flex min-h-14 items-center rounded-2xl border-2 border-border px-6 text-lg font-semibold">
          Home
        </Link>
      </div>
      {error.digest && <p className="text-sm text-muted">Reference: {error.digest}</p>}
    </main>
  );
}
