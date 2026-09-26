// Data model (brief §7). Protocols are immutable once a bench session starts:
// the session holds its own snapshot.

export type ProtocolSource = "sample" | "pasted" | "uploaded";

export type Step = {
  number: number; // 1-based
  text: string; // exact text to read aloud
  durationSeconds: number | null;
  reagents: string[];
};

export type Protocol = {
  id: string;
  title: string;
  source: ProtocolSource;
  steps: Step[];
  keyterms: string[];
  createdAt: string; // ISO
};

export type ParseSource = "llm" | "fallback" | "sample";

export type ParseResult = {
  protocol: Protocol;
  source: ParseSource;
  missingNumbers: string[];
  /** Why the fallback was used, for the setup screen. */
  note?: string;
};
