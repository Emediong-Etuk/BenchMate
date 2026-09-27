import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-6 py-16">
      <h1 className="text-3xl font-semibold">Page not found</h1>
      <p className="text-lg text-muted">That page doesn&apos;t exist. Your sessions are listed on the home screen.</p>
      <Link href="/" className="inline-flex min-h-14 w-fit items-center rounded-2xl bg-accent px-6 text-lg font-semibold text-white dark:text-black">
        Home
      </Link>
    </main>
  );
}
