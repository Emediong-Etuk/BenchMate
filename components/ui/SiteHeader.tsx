"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import { signOutAndForget } from "@/components/auth/authActions";
import { useBenchStore } from "@/lib/store/benchStore";
import { useHydratedBenchStore } from "@/lib/store/useHydrated";
import { buttonClass } from "./button";
import { Logo } from "./Logo";
import { SyncBadge } from "./SyncBadge";

/** Top navigation shared by every screen except the bench itself. */
export function SiteHeader() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const signedIn = status === "authenticated";
  const hydrated = useHydratedBenchStore();
  const active = useBenchStore((s) => s.sessions.find((x) => x.id === s.activeSessionId && !x.endedAt));

  const links = signedIn
    ? [
        { href: "/dashboard", label: "Dashboard" },
        { href: "/about", label: "About" },
      ]
    : [
        { href: "/", label: "Home" },
        { href: "/about", label: "About" },
      ];

  return (
    <header className="no-print border-b border-border/70 bg-bg/80 backdrop-blur">
      <nav className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-2 px-4 py-3 sm:px-6" aria-label="Main">
        <Link href={signedIn ? "/dashboard" : "/"} className="mr-3 rounded-xl" aria-label="BenchMate home">
          <Logo />
        </Link>
        {links.map((l) => {
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
        <div className="ml-auto flex items-center gap-2">
          {signedIn && hydrated && <SyncBadge />}
          {signedIn && hydrated && active && pathname !== "/bench" && (
            <Link href="/bench" className={buttonClass("primary", "md")}>
              <span className="h-2 w-2 rounded-full bg-on-accent/70" aria-hidden />
              <span className="hidden sm:inline">Back to your session</span>
              <span className="sm:hidden">Session</span>
            </Link>
          )}
          {signedIn && session?.user ? (
            <UserMenu name={session.user.name ?? session.user.email ?? "Account"} email={session.user.email ?? ""} image={session.user.image ?? null} />
          ) : status === "unauthenticated" && pathname !== "/signin" ? (
            <Link href="/signin" className={buttonClass("secondary", "md")}>
              Sign in
            </Link>
          ) : null}
        </div>
      </nav>
    </header>
  );
}

export function Avatar({ name, image, size = 36 }: { name: string; image: string | null; size?: number }) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return image ? (
    // eslint-disable-next-line @next/next/no-img-element -- Google avatar URL; no image optimisation needed
    <img src={image} alt="" width={size} height={size} referrerPolicy="no-referrer" className="shrink-0 rounded-full border border-border" style={{ width: size, height: size }} />
  ) : (
    <span className="grid shrink-0 place-items-center rounded-full bg-accent-soft font-semibold text-accent" style={{ width: size, height: size }} aria-hidden>
      {initial}
    </span>
  );
}

function UserMenu({ name, email, image }: { name: string; email: string; image: string | null }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Account menu" className="rounded-full p-0.5 hover:ring-2 hover:ring-border-strong">
        <Avatar name={name} image={image} />
      </button>
      {open && (
        <div className="fade-up absolute right-0 top-12 z-30 w-64 rounded-2xl border border-border bg-surface p-2 shadow-2xl">
          <div className="px-3 py-2">
            <p className="truncate font-medium text-text">{name}</p>
            {email && <p className="truncate text-sm text-muted">{email}</p>}
          </div>
          <Link href="/dashboard" className="block rounded-xl px-3 py-2 text-[15px] text-muted hover:bg-surface-2 hover:text-text" onClick={() => setOpen(false)}>
            Dashboard
          </Link>
          <Link href="/dashboard#account" className="block rounded-xl px-3 py-2 text-[15px] text-muted hover:bg-surface-2 hover:text-text" onClick={() => setOpen(false)}>
            Account settings
          </Link>
          <button type="button" onClick={() => void signOutAndForget()} className="block w-full rounded-xl px-3 py-2 text-left text-[15px] text-muted hover:bg-surface-2 hover:text-text">
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
