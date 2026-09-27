import type { Metadata } from "next";
import { Suspense } from "react";
import { PasscodeForm } from "./PasscodeForm";

export const metadata: Metadata = { title: "Passcode · BenchMate" };

export default function PasscodePage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-6 py-20">
      <h1 className="text-4xl font-semibold tracking-tight">BenchMate</h1>
      <p className="text-lg text-muted">This demo is protected. Enter the passcode you were given.</p>
      <Suspense>
        <PasscodeForm />
      </Suspense>
    </main>
  );
}
