import type { Metadata } from "next";
import { EntryPlaceholder } from "./EntryPlaceholder";

export const metadata: Metadata = { title: "Notebook entry · BenchMate" };

// Phase 3 placeholder so the finish flow lands somewhere; the generated
// notebook entry (Markdown/JSON exports, print) arrives in Phase 5.
export default async function EntryPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return <EntryPlaceholder sessionId={sessionId} />;
}
