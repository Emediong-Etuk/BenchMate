"use client";

import { useSession } from "next-auth/react";
import { useEffect } from "react";
import { useBenchStore } from "./benchStore";

/**
 * Loads the signed-in user's data (after first render, so SSR markup
 * matches). Signed-out visitors never trigger a load.
 */
export function useHydratedBenchStore(): boolean {
  const hydrated = useBenchStore((s) => s.hydrated);
  const { status } = useSession();
  useEffect(() => {
    if (status === "authenticated") void useBenchStore.getState().hydrate();
  }, [status]);
  return hydrated;
}
