import { describe, expect, it } from "vitest";
import { deriveStatus, type StatusInputs } from "@/lib/voice/agentStatus";
import { addWord, emptyCaption, visibleCaption } from "@/lib/voice/captions";

const base: StatusInputs = {
  connection: "ready",
  muted: false,
  userSpeaking: false,
  awaitingReply: false,
  pendingToolResults: 0,
  agentPlaying: false,
};

describe("deriveStatus", () => {
  it("maps connection states first", () => {
    expect(deriveStatus({ ...base, connection: "connecting" })).toBe("Connecting");
    expect(deriveStatus({ ...base, connection: "reconnecting", agentPlaying: true })).toBe("Reconnecting");
    expect(deriveStatus({ ...base, connection: "error" })).toBe("Error");
  });

  it("walks the normal turn cycle", () => {
    expect(deriveStatus(base)).toBe("Listening");
    expect(deriveStatus({ ...base, userSpeaking: true })).toBe("Hearing you");
    expect(deriveStatus({ ...base, awaitingReply: true })).toBe("Thinking");
    expect(deriveStatus({ ...base, pendingToolResults: 1 })).toBe("Thinking");
    expect(deriveStatus({ ...base, agentPlaying: true })).toBe("Speaking");
  });

  it("shows barge-in as Hearing you even while audio drains", () => {
    expect(deriveStatus({ ...base, agentPlaying: true, userSpeaking: true })).toBe("Hearing you");
  });

  it("shows Muted when idle and muted, but Speaking still wins", () => {
    expect(deriveStatus({ ...base, muted: true })).toBe("Muted");
    expect(deriveStatus({ ...base, muted: true, agentPlaying: true })).toBe("Speaking");
  });
});

describe("captions", () => {
  const c0 = ["Step ", "2. ", "Add ", "fifty "].reduce(
    (c, w, i) => addWord(c, w, i * 300),
    emptyCaption("resp_1"),
  );

  it("shows nothing until playback starts", () => {
    expect(visibleCaption(c0, 10_000)).toBe("");
  });

  it("reveals words by start_ms", () => {
    const c = { ...c0, playbackStartedAt: 1000 };
    expect(visibleCaption(c, 1000)).toBe("Step");
    expect(visibleCaption(c, 1650)).toBe("Step 2. Add");
    expect(visibleCaption(c, 9999)).toBe("Step 2. Add fifty");
  });

  it("shows everything once final and joins words lacking spaces", () => {
    const c = addWord(addWord(emptyCaption("r"), "Hello", null), "there", null);
    expect(visibleCaption({ ...c, final: true }, 0)).toBe("Hello there");
  });
});
