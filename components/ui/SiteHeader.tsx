"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useBenchStore } from "@/lib/store/benchStore";
import { useHydratedBenchStore } from "@/lib/store/useHydrated";
import { buttonClass } from "./button";
import { Logo } from "./Logo";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
] as const;

/** Top navigation shared by every screen except the bench itself. */
export function SiteHeader() {
  const pathname = usePathname();
  const hydrated = useHydratedBenchStore();
  const active = useBenchStore((s) => s.sessions.find((x) => x.id === s.activeSessionId && !x.endedAt));

  return (
    <header className="no-print border-b border-border/70 bg-bg/80 backdrop-blur">
      <nav className="mx-auto flex w-full max-w-6xl items-center gap-2 px-4 py-3 sm:px-6" aria-label="Main">
        <Link href="/" className="mr-4 rounded-xl" aria-label="BenchMate home">
          <Logo />
        </Link>
        {LINKS.map((l) => {
          const current = pathname === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={current ? "page" : undefined}
              className={`rounded-xl px-3 py-2 text-[15px] transition-colors ${current ? "bg-surface-2 text-text" : "text-muted hover:text-text"}`}
            >
              {l.label}
            </Link>
          );
        })}
        {hydrated && active && pathname !== "/bench" && (
          <Link href="/bench" className={buttonClass("primary", "md", "ml-auto")}>
            <span className="h-2 w-2 rounded-full bg-on-accent/70" aria-hidden />
            Back to your session
          </Link>
        )}
      </nav>
    </header>
  );
}
