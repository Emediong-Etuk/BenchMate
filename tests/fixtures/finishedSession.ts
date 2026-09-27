import type { BenchSession, LogEntry } from "@/lib/store/types";
import { makeSession } from "./session";

const t = (hms: string) => `2026-09-26T14:${hms}.000Z`;
const base = { sourceUtterance: "", status: "confirmed" as const };

/** A finished demo session exercising every notebook section. */
export function finishedSession(): BenchSession {
  const entries: LogEntry[] = [
    { ...base, id: "e1", kind: "measurement", createdAt: t("05:10"), stepNumber: 4, callId: "c1", groupId: "u1", sourceUtterance: "sample two 245 nanograms per microliter 260 over 280 is 1.86", status: "voided", voidedAt: t("05:30"), payload: { sampleId: "2", quantity: "concentration", value: 245, unit: "ng/µL" } },
    { ...base, id: "e2", kind: "measurement", createdAt: t("05:10"), stepNumber: 4, callId: "c2", groupId: "u1", sourceUtterance: "sample two 245 nanograms per microliter 260 over 280 is 1.86", status: "voided", voidedAt: t("05:30"), payload: { sampleId: "2", quantity: "260/280", value: 1.86, unit: "" } },
    { ...base, id: "e3", kind: "measurement", createdAt: t("05:31"), stepNumber: 4, callId: "c3", groupId: "u2", sourceUtterance: "no 254 not 245", payload: { sampleId: "2", quantity: "concentration", value: 254, unit: "ng/µL" } },
    { ...base, id: "e4", kind: "measurement", createdAt: t("05:31"), stepNumber: 4, callId: "c4", groupId: "u2", sourceUtterance: "no 254 not 245", payload: { sampleId: "2", quantity: "260/280", value: 1.86, unit: "" } },
    { ...base, id: "e5", kind: "measurement", createdAt: t("04:40"), stepNumber: 4, callId: "c5", groupId: "u0", sourceUtterance: "sample one 182 nanograms per microliter", payload: { sampleId: "1", quantity: "concentration", value: 182, unit: "ng/µL" } },
    { ...base, id: "e6", kind: "measurement", createdAt: t("06:00"), stepNumber: 4, callId: "c6", groupId: "u3", sourceUtterance: "control reads 3.2", status: "unconfirmed", payload: { sampleId: "control", quantity: "concentration", value: 3.2, unit: "ng/µL" } },
    { ...base, id: "e7", kind: "deviation", createdAt: t("03:02"), stepNumber: 2, callId: "c7", groupId: "u4", sourceUtterance: "done but I spun for three minutes instead of one", payload: { description: "Spun for 3 minutes instead of 1.", planned: "1 minute", actual: "3 minutes" } },
    { ...base, id: "e8", kind: "observation", createdAt: t("04:05"), stepNumber: 3, callId: "c8", groupId: "u5", sourceUtterance: "tube four looks cloudy", payload: { text: "Tube 4 looks cloudy | faint pellet.", sampleId: "4" } },
  ];
  return {
    ...makeSession(),
    id: "s-fixture",
    researcherName: "Ada Lovelace",
    samples: ["1", "2", "3", "control"],
    startedAt: t("00:00"),
    endedAt: "2026-09-26T15:12:40.000Z",
    assemblyaiSessionIds: ["sess_aaa", "sess_bbb"],
    currentStep: 4,
    stepEvents: [
      { stepNumber: 1, startedAt: t("00:15"), completedAt: t("01:20") },
      { stepNumber: 2, startedAt: t("01:20"), completedAt: t("03:05") },
      { stepNumber: 3, startedAt: t("03:05"), completedAt: t("04:30") },
      { stepNumber: 2, startedAt: t("04:31") },
      { stepNumber: 4, startedAt: t("04:35"), completedAt: "2026-09-26T15:12:30.000Z" },
    ],
    entries,
    timers: [
      { id: "t1", label: "incubation", durationSeconds: 600, startedAt: t("03:10"), endsAt: t("13:10"), status: "done", announced: true, finishedAt: t("13:10") },
      { id: "t2", label: "spin", durationSeconds: 60, startedAt: t("02:00"), endsAt: t("03:00"), status: "cancelled", announced: false, finishedAt: t("02:30") },
    ],
    transcript: [
      { role: "agent", text: "BenchMate ready. Mini test protocol, 4 steps.", at: t("00:10") },
      { role: "user", text: "Start.", at: t("00:14") },
      { role: "agent", text: "Step 1. Add 250 µL Buffer P1.", at: t("00:16") },
      { role: "user", text: "next", at: t("01:19"), typed: true },
      { role: "agent", text: "Step 2. Centrifuge 1 min at", at: t("01:22"), interrupted: true },
    ],
  };
}
