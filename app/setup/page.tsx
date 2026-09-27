import type { Metadata } from "next";
import { SetupClient } from "@/components/setup/SetupClient";

export const metadata: Metadata = { title: "Set up · BenchMate" };

export default function SetupPage() {
  return <SetupClient />;
}
