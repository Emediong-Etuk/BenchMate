/** Flask mark + wordmark. */
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0" aria-hidden>
        <rect width="32" height="32" rx="9" fill="var(--accent-soft)" />
        <path
          d="M12.5 8h7M14 8v6.2l-4.8 8.1A1.8 1.8 0 0 0 10.8 25h10.4a1.8 1.8 0 0 0 1.6-2.7L18 14.2V8"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M11.6 20.5h8.8" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      {!compact && <span className="text-lg font-semibold tracking-tight text-text">BenchMate</span>}
    </span>
  );
}
