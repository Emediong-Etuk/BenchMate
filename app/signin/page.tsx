import type { Metadata } from "next";
import Link from "next/link";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { Logo } from "@/components/ui/Logo";

export const metadata: Metadata = { title: "Sign in · BenchMate" };

const ERRORS: Record<string, string> = {
  OAuthAccountNotLinked: "That email is already linked to a different sign-in. Use the Google account you signed up with.",
  AccessDenied: "Sign-in was cancelled or not allowed.",
  Configuration: "Sign-in isn't set up correctly on the server yet. Please try again later.",
};

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string; error?: string }> }) {
  const { callbackUrl, error } = await searchParams;
  const next = callbackUrl && callbackUrl.startsWith("/") && !callbackUrl.startsWith("//") ? callbackUrl : "/dashboard";
  const message = error ? (ERRORS[error] ?? "Something went wrong signing in. Please try again.") : null;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 px-6 py-16">
      <Link href="/" className="w-fit rounded-xl" aria-label="BenchMate home">
        <Logo />
      </Link>
      <div className="fade-up flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">Sign in or create an account</h1>
        <p className="text-lg text-muted">One click with Google. Your protocols, sessions and notebook entries are private to your account.</p>
      </div>
      {message && (
        <p role="alert" className="rounded-2xl border border-bad/30 bg-bad/[0.07] px-5 py-3 text-[15px] text-text">
          {message}
        </p>
      )}
      <GoogleButton callbackUrl={next} size="xl" className="w-full rounded-3xl" />
      <ul className="flex flex-col gap-2 text-[15px] text-muted">
        <li className="flex gap-3">
          <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
          New here? Signing in creates your account.
        </li>
        <li className="flex gap-3">
          <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
          BenchMate only receives your name, email address and profile picture from Google.
        </li>
        <li className="flex gap-3">
          <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
          You can delete your account and everything in it at any time.
        </li>
      </ul>
      <Link href="/about" className="text-sm text-muted hover:text-text">
        What is BenchMate? →
      </Link>
    </main>
  );
}
