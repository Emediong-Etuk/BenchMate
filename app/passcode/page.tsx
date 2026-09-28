import type { Metadata } from "next";
import { Suspense } from "react";
import { Logo } from "@/components/ui/Logo";
import { PasscodeForm } from "./PasscodeForm";

export const metadata: Metadata = { title: "Passcode · BenchMate" };

export default function PasscodePage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-6 py-20">
      <Logo />
      <h1 className="text-3xl font-semibold tracking-tight">Welcome</h1>
      <p className="text-lg text-muted">This demo is private. Enter the passcode you were given to continue.</p>
      <Suspense>
        <PasscodeForm />
      </Suspense>
    </main>
  );
}
