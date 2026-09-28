"use client";

// Last-resort boundary when the root layout itself fails. Inline styles only:
// the app's CSS may not have loaded.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#0f1418", color: "#e3e8eb", margin: 0 }}>
        <main style={{ maxWidth: 560, margin: "0 auto", padding: "64px 24px" }}>
          <h1 style={{ fontSize: 28 }}>BenchMate hit an unexpected problem</h1>
          <p style={{ fontSize: 18, color: "#95a3ad" }}>Your lab data is saved in this browser. Reload to continue where you left off.</p>
          <button
            type="button"
            onClick={() => (reset ? reset() : window.location.reload())}
            style={{ fontSize: 18, padding: "14px 24px", borderRadius: 16, border: 0, background: "#86cbb8", color: "#0b1714", cursor: "pointer" }}
          >
            Reload
          </button>
        </main>
      </body>
    </html>
  );
}
