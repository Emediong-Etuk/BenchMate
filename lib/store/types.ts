import type { ParseSource, Protocol } from "@/lib/protocol/types";

// Brief §7 data model.

export type TranscriptionMode = "min_latency" | "balanced" | "max_accuracy";
export type VoiceFocus = "near-field" | "far-field";

export type Settings = {
  voice: string;
  transcriptionMode: TranscriptionMode;
  voiceFocus: VoiceFocus;
  volume: number; // 0–150 %
  autoGainControl: boolean;
  vadThreshold: number | null; // null = server default (adaptive)
  showDebug: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  voice: "alba",
  transcriptionMode: "balanced",
  voiceFocus: "far-field",
  volume: 100,
  autoGainControl: false,
  vadThreshold: null,
  showDebug: false,
};

export type MeasurementPayload = { sampleId: string; quantity: string; value: number; unit: string };
export type DeviationPayload = { description: string; planned?: string; actual?: string };
export type ObservationPayload = { text: string; sampleId?: string };

type EntryBase = {
  id: string;
  createdAt: string;
  stepNumber: number;
  sourceUtterance: string;
  callId: string;
  /** Entries from one user utterance share this (several calls may make them); "scratch that" voids the group. */
  groupId?: string;
  status: "pending" | "confirmed" | "unconfirmed" | "voided";
  voidedAt?: string;
};

export type LogEntry =
  | (EntryBase & { kind: "measurement"; payload: MeasurementPayload })
  | (EntryBase & { kind: "deviation"; payload: DeviationPayload })
  | (EntryBase & { kind: "observation"; payload: ObservationPayload });

export type Timer = {
  id: string;
  label: string;
  durationSeconds: number;
  startedAt: string;
  endsAt: string;
  status: "running" | "done" | "cancelled";
  announced: boolean;
  finishedAt?: string;
  /** Finished timers flash until the next user utterance or a tap. */
  dismissed?: boolean;
};

export type StepEvent = { stepNumber: number; startedAt: string; completedAt?: string };

export type SessionTranscriptLine = { role: "user" | "agent"; text: string; at: string; interrupted?: boolean; typed?: boolean };

export type BenchSession = {
  id: string;
  protocol: Protocol; // snapshot at start; never mutated after start
  researcherName?: string;
  samples: string[];
  startedAt: string;
  endedAt?: string;
  /** Last local change; used to reconcile with the account copy. */
  updatedAt?: string;
  assemblyaiSessionIds: string[];
  currentStep: number; // 0 = not started
  stepEvents: StepEvent[];
  entries: LogEntry[];
  timers: Timer[];
  transcript: SessionTranscriptLine[];
  settings: Pick<Settings, "voice" | "transcriptionMode" | "voiceFocus" | "volume">;
};

/** Protocol being reviewed on /setup before a session starts. */
export type Draft = {
  protocol: Protocol;
  parseSource: ParseSource;
  missingNumbers: string[];
  note?: string;
  samplesInput: string;
};
