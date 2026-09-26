import Link from "next/link";

// Phase 1 placeholder. The real Home (protocol cards, recent sessions) lands in Phase 2.
export default function Home() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16">
      <h1 className="text-4xl font-semibold tracking-tight">BenchMate</h1>
      <p className="mt-3 text-lg text-muted">Gloves on. Hands full. Notebook still gets written.</p>
      <Link
        href="/bench"
        className="mt-10 inline-flex min-h-16 items-center rounded-2xl bg-accent px-8 text-lg font-semibold text-white dark:text-black"
      >
        Voice check →
      </Link>
    </main>
  );
}
