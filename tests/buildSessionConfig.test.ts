import { describe, expect, it } from "vitest";
import { buildSessionConfig, validateSessionConfig } from "@/lib/agent/buildSessionConfig";
import { renderSystemPrompt } from "@/lib/agent/systemPrompt";
import { MAX_TRANSCRIPTION_PROMPT, buildTranscriptionPrompt } from "@/lib/agent/transcriptionPrompt";
import { DEFAULT_SETTINGS } from "@/lib/store/types";
import { makeSession } from "./fixtures/session";

describe("buildSessionConfig", () => {
  it("assembles prompt, greeting, tools and input settings within limits", () => {
    const c = buildSessionConfig(makeSession(), { settings: DEFAULT_SETTINGS });
    expect(c.greeting).toBe('BenchMate ready. Mini test protocol, 4 steps. Say "start" when you\'re ready.');
    expect(c.tools).toHaveLength(10);
    expect(c.input?.language_codes).toEqual(["en"]);
    expect(c.input?.voice_focus).toBe("far-field");
    expect(c.input?.transcription_mode).toBe("balanced");
    expect(c.input?.turn_detection).toBeUndefined();
    expect(c.input!.keyterms!.length).toBeLessThanOrEqual(100);
    expect(c.input!.keyterms).toContain("Buffer P1");
    expect(c.input!.transcription_prompt!.length).toBeLessThanOrEqual(1750);
    expect(c.output).toEqual({ voice: "alba" });
  });

  it("uses the reconnect greeting with the current position", () => {
    const c = buildSessionConfig({ ...makeSession(), currentStep: 3 }, { settings: DEFAULT_SETTINGS, isReconnect: true });
    expect(c.greeting).toBe("Reconnected. You're on step 3 of 4.");
  });

  it("passes a VAD threshold only when set", () => {
    const c = buildSessionConfig(makeSession(), { settings: { ...DEFAULT_SETTINGS, vadThreshold: 0.7 } });
    expect(c.input?.turn_detection).toEqual({ vad_threshold: 0.7 });
  });

  it("rejects payloads over the documented limits", () => {
    expect(() => validateSessionConfig({ system_prompt: "x", input: { keyterms: Array.from({ length: 101 }, (_, i) => `t${i}`) } })).toThrow(/keyterms/);
    expect(() => validateSessionConfig({ system_prompt: "x", input: { transcription_prompt: "a".repeat(1751) } })).toThrow(/transcription_prompt/);
  });
});

describe("renderSystemPrompt", () => {
  it("fills placeholders with protocol, samples, position and numbered steps", () => {
    const p = renderSystemPrompt({ ...makeSession(), currentStep: 2 });
    expect(p).toContain("Protocol: Mini test protocol (4 steps)");
    expect(p).toContain("Samples in this run: 1–3, control");
    expect(p).toContain("Current step as of this update: 2 of 4: Centrifuge 1 min at 13,000 x g.");
    expect(p).toContain("<protocol>\n1. Add 250 µL Buffer P1.\n2. Centrifuge");
    expect(p).not.toMatch(/\{\{/);
  });

  it("includes a recent-log and running-timer summary for reconnects", () => {
    const s = {
      ...makeSession(),
      currentStep: 2,
      entries: [
        { id: "a", kind: "observation" as const, createdAt: "x", stepNumber: 2, sourceUtterance: "", callId: "c", status: "voided" as const, payload: { text: "VOIDED-OBSERVATION" } },
        { id: "b", kind: "observation" as const, createdAt: "x", stepNumber: 2, sourceUtterance: "", callId: "d", status: "confirmed" as const, payload: { text: "Tube 4 looks cloudy." } },
      ],
      timers: [{ id: "t", label: "spin", durationSeconds: 600, startedAt: "2026-09-26T10:00:00.000Z", endsAt: "2026-09-26T10:10:00.000Z", status: "running" as const, announced: false }],
    };
    const p = renderSystemPrompt(s, new Date("2026-09-26T10:05:00.000Z"));
    expect(p).toContain("Recent log (newest last): step 2 observation: Tube 4 looks cloudy.");
    expect(p).not.toContain("VOIDED-OBSERVATION");
    expect(p).toContain("Running timers: 'spin' with 5 minutes left");
  });

  it("says 'not specified' / 'not started' when appropriate", () => {
    const p = renderSystemPrompt({ ...makeSession(), samples: [] });
    expect(p).toContain("Samples in this run: not specified");
    expect(p).toContain("Current step as of this update: not started");
    expect(p).toContain("Recent log (newest last): nothing logged yet");
    expect(p).toContain("Running timers: none");
  });
});

describe("buildTranscriptionPrompt", () => {
  it("stays under 1750 chars even with many reagents", () => {
    const s = makeSession();
    s.protocol.keyterms = Array.from({ length: 200 }, (_, i) => `reagent-number-${i}`);
    const p = buildTranscriptionPrompt(s);
    expect(p.length).toBeLessThanOrEqual(MAX_TRANSCRIPTION_PROMPT);
    expect(p).toMatch(/reagent-number-0/);
    expect(p.endsWith(".")).toBe(true);
  });
});
