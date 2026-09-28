import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { SiteHeader } from "@/components/ui/SiteHeader";

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-6 py-20">
        <h1 className="text-3xl font-semibold">Page not found</h1>
        <p className="text-lg text-muted">That page doesn&apos;t exist. Your sessions are on the home screen.</p>
        <Link href="/" className={buttonClass("primary", "lg", "w-fit")}>
          Home
        </Link>
      </main>
    </>
  );
}
