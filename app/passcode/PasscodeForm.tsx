"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { buttonClass } from "@/components/ui/button";

export function PasscodeForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Only same-site paths, never an absolute URL.
  const raw = params.get("next") ?? "/";
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const res = await fetch("/api/passcode", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ passcode: value }) });
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        if (res.ok) {
          router.replace(next);
          router.refresh();
        } else {
          setError(body.error ?? "That didn't work.");
          setBusy(false);
        }
      }}
    >
      <input
        type="password"
        autoFocus
        autoComplete="current-password"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label="Passcode"
        className="min-h-14 rounded-2xl border border-border bg-surface px-4 text-xl text-text"
      />
      <button type="submit" disabled={busy || !value} className={buttonClass("primary", "lg", "min-h-14")}>
        {busy ? "Checking…" : "Enter"}
      </button>
      {error && (
        <p role="alert" className="text-bad">
          {error}
        </p>
      )}
    </form>
  );
}
