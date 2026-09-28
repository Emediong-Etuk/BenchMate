"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { buttonClass } from "@/components/ui/button";
import { SiteHeader } from "@/components/ui/SiteHeader";

const HOW = [
  { n: "1", title: "Pick your steps", body: "Choose a ready-made protocol or paste your own. BenchMate lays it out as clear, numbered steps you can check." },
  { n: "2", title: "Talk while you work", body: "Say “next”, read out a number, start a timer. BenchMate reads each step aloud and repeats back what it wrote down." },
  { n: "3", title: "Get your notes", body: "Say “I’m done” and your notebook entry is ready: every reading, change and note, in tidy tables." },
];

const PERKS = [
  { title: "Private to you", body: "Every session and notebook entry belongs to your account. Nobody else can see them." },
  { title: "On any device", body: "Start on the lab laptop, review the entry later from home. Everything is saved to your account." },
  { title: "One click to join", body: "Sign up with Google. No passwords to remember, nothing to fill in." },
];

/** Public landing page. Signed-in visitors get a shortcut to their dashboard. */
export function HomeClient() {
  const { status } = useSession();
  const signedIn = status === "authenticated";

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-20 px-4 pb-16 pt-14 sm:px-6 sm:pt-20">
        <section className="fade-up flex max-w-3xl flex-col gap-6">
          <p className="w-fit rounded-full border border-border bg-surface px-3 py-1 text-sm text-muted">A hands-free voice assistant for lab work</p>
          <h1 className="text-4xl font-semibold tracking-tight text-text sm:text-5xl">Hands busy? Just talk.</h1>
          <p className="text-xl leading-relaxed text-muted sm:text-2xl sm:leading-relaxed">
            BenchMate <span className="text-text">reads your lab steps out loud</span>, <span className="text-text">writes down what you say</span>,
            and turns it into a <span className="text-text">tidy notebook entry</span>, so your hands can stay on the work.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            {signedIn ? (
              <Link href="/dashboard" className={buttonClass("primary", "lg")}>
                Go to your dashboard
              </Link>
            ) : (
              <>
                <GoogleButton callbackUrl="/dashboard" label="Get started with Google" />
                <Link href="/signin?callbackUrl=%2Fdashboard%3Fstart%3Ddemo-mock" className={buttonClass("secondary", "lg")}>
                  Try the practice run
                </Link>
              </>
            )}
            <Link href="/about" className={buttonClass("ghost", "lg")}>
              How it works →
            </Link>
          </div>
        </section>

        <section aria-labelledby="how-heading" className="flex flex-col gap-6">
          <h2 id="how-heading" className="text-xl font-semibold text-text">
            How it works
          </h2>
          <ol className="grid gap-4 md:grid-cols-3">
            {HOW.map((h) => (
              <li key={h.n} className="flex flex-col gap-3 rounded-3xl border border-border bg-surface p-6">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-accent-soft font-semibold text-accent">{h.n}</span>
                <h3 className="text-lg font-semibold text-text">{h.title}</h3>
                <p className="text-muted">{h.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="account-heading" className="flex flex-col gap-6">
          <h2 id="account-heading" className="text-xl font-semibold text-text">
            Your own lab notebook account
          </h2>
          <ul className="grid gap-4 md:grid-cols-3">
            {PERKS.map((p) => (
              <li key={p.title} className="rounded-3xl border border-border bg-surface p-6">
                <h3 className="font-semibold text-text">{p.title}</h3>
                <p className="mt-2 text-muted">{p.body}</p>
              </li>
            ))}
          </ul>
        </section>

        {!signedIn && (
          <section className="flex flex-col items-start gap-4 rounded-3xl border border-accent/30 bg-accent-soft/60 p-8">
            <h2 className="text-xl font-semibold text-text">Ready to try it?</h2>
            <p className="text-muted">Create your account with Google, then start the two-minute practice run. No lab needed.</p>
            <GoogleButton callbackUrl="/dashboard?start=demo-mock" label="Sign up and start the practice run" />
          </section>
        )}
      </main>
    </>
  );
}
