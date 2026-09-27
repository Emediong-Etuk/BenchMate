import { describe, expect, it } from "vitest";
import { formatDurationSpoken } from "@/lib/agent/format";
import { announcementInstructions, dismissFinished, fireDueTimers, markAnnounced, pendingAnnouncements } from "@/lib/agent/timers";
import type { Timer } from "@/lib/store/types";
import { makeSession } from "./fixtures/session";

const T = (id: string, endsAt: string, over: Partial<Timer> = {}): Timer => ({
  id,
  label: id,
  durationSeconds: 60,
  startedAt: "2026-09-26T10:00:00.000Z",
  endsAt,
  status: "running",
  announced: false,
  ...over,
});

describe("timers", () => {
  it("fires timers whose end has passed, including ones that ended while offline", () => {
    const s = makeSession({ timers: [T("a", "2026-09-26T10:01:00.000Z"), T("b", "2026-09-26T10:05:00.000Z"), T("c", "2026-09-26T09:00:00.000Z")] });
    const out = fireDueTimers(s, new Date("2026-09-26T10:02:00.000Z"));
    expect(out.fired.map((t) => t.id)).toEqual(["a", "c"]);
    expect(out.session.timers.map((t) => t.status)).toEqual(["done", "running", "done"]);
    expect(out.session.timers[0]!.finishedAt).toBe("2026-09-26T10:01:00.000Z");
    expect(fireDueTimers(out.session, new Date("2026-09-26T10:02:01.000Z")).fired).toEqual([]);
  });

  it("ignores cancelled timers", () => {
    const s = makeSession({ timers: [T("a", "2026-09-26T10:01:00.000Z", { status: "cancelled" })] });
    expect(fireDueTimers(s, new Date("2026-09-26T11:00:00.000Z")).fired).toEqual([]);
  });

  it("lists pending announcements oldest first and marks them announced", () => {
    let s = makeSession({
      timers: [T("late", "2026-09-26T10:03:00.000Z", { status: "done" }), T("early", "2026-09-26T10:01:00.000Z", { status: "done" }), T("run", "2026-09-26T11:00:00.000Z")],
    });
    expect(pendingAnnouncements(s).map((t) => t.id)).toEqual(["early", "late"]);
    s = markAnnounced(s, "early");
    expect(pendingAnnouncements(s).map((t) => t.id)).toEqual(["late"]);
    expect(markAnnounced(s, "early")).toBe(s);
  });

  it("dismisses the flash on one or all finished timers", () => {
    const s = makeSession({ timers: [T("a", "x", { status: "done" }), T("b", "x", { status: "done" })] });
    expect(dismissFinished(s, "a").timers.map((t) => Boolean(t.dismissed))).toEqual([true, false]);
    expect(dismissFinished(s).timers.every((t) => t.dismissed)).toBe(true);
  });

  it("builds the announcement instruction, noting timers that finished offline", () => {
    const s = { ...makeSession(), currentStep: 3 };
    const timer = T("incubation", "2026-09-26T10:10:00.000Z", { durationSeconds: 600, status: "done" });
    expect(announcementInstructions(s, timer, new Date("2026-09-26T10:10:01.000Z"))).toBe(
      "In one short sentence, tell the user their 'incubation' timer (10 minutes) has finished. They are on step 3 of 4.",
    );
    expect(announcementInstructions(s, timer, new Date("2026-09-26T10:12:00.000Z"))).toMatch(/finished 2 minutes ago/);
  });

  it("formats spoken durations", () => {
    expect(formatDurationSpoken(60)).toBe("1 minute");
    expect(formatDurationSpoken(90)).toBe("1 minute 30 seconds");
    expect(formatDurationSpoken(5400)).toBe("1 hour 30 minutes");
  });
});
