import type { Metadata } from "next";
import { BenchClient } from "@/components/bench/BenchClient";

export const metadata: Metadata = { title: "Bench · BenchMate" };

export default function BenchPage() {
  return <BenchClient />;
}
