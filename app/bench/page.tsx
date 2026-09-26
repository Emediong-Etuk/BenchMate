import type { Metadata } from "next";
import { VoiceCheck } from "./VoiceCheck";

export const metadata: Metadata = { title: "Bench · BenchMate" };

// Phase 1: voice-loop harness. The full hands-free bench screen replaces
// this in Phase 3.
export default function BenchPage() {
  return <VoiceCheck />;
}
