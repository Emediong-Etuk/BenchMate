"use client";

import Link from "next/link";
import { useEffect } from "react";
import { buttonClass } from "@/components/ui/button";

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
        <button type="button" onClick={reset} className={buttonClass("primary", "lg")}>
          Try again
        </button>
        <Link href="/" className={buttonClass("secondary", "lg")}>
          Home
        </Link>
      </div>
      {error.digest && <p className="text-sm text-muted">Reference: {error.digest}</p>}
    </main>
  );
}
