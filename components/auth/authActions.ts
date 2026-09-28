"use client";

import { signIn, signOut } from "next-auth/react";
import { useBenchStore } from "@/lib/store/benchStore";

/** Only same-site paths, never an absolute URL. */
export function safeCallback(raw: string | null | undefined, fallback = "/dashboard"): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : fallback;
}

export function signInWithGoogle(callbackUrl = "/dashboard") {
  return signIn("google", { redirectTo: safeCallback(callbackUrl) });
}

/** Clears this user's cached data from the browser, then signs out. */
export function signOutAndForget() {
  useBenchStore.getState().clearLocalData();
  return signOut({ redirectTo: "/" });
}
