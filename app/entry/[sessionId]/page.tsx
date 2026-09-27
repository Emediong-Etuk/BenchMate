import type { Metadata } from "next";
import { EntryClient } from "@/components/entry/EntryClient";

export const metadata: Metadata = { title: "Notebook entry · BenchMate" };

export default async function EntryPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return <EntryClient sessionId={sessionId} />;
}
