"use client";

import { useEffect } from "react";
import { useBenchStore } from "./benchStore";

/** Loads persisted state on the client (after first render, so SSR markup matches). */
export function useHydratedBenchStore(): boolean {
  const hydrated = useBenchStore((s) => s.hydrated);
  useEffect(() => {
    useBenchStore.getState().hydrate();
  }, []);
  return hydrated;
}
