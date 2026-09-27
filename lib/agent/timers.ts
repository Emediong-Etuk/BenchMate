import type { BenchSession, Timer } from "@/lib/store/types";
import { formatDurationSpoken } from "./format";

// Pure timer lifecycle helpers (brief §8.6, §14). Timers fire in the browser
// by comparing endsAt with the clock, so they survive reloads: a timer that
// ended while the page was closed fires on the next check.

/** Mark running timers whose endsAt has passed as done. Returns the ones that just fired. */
export function fireDueTimers(session: BenchSession, now: Date): { session: BenchSession; fired: Timer[] } {
  const fired: Timer[] = [];
  const t = now.getTime();
  const timers = session.timers.map((timer) => {
    if (timer.status !== "running" || Date.parse(timer.endsAt) > t) return timer;
    const done: Timer = { ...timer, status: "done", finishedAt: timer.endsAt };
    fired.push(done);
    return done;
  });
  return fired.length ? { session: { ...session, timers }, fired } : { session, fired };
}

/** Timers that finished but haven't been announced yet, oldest first. */
export function pendingAnnouncements(session: BenchSession): Timer[] {
  return session.timers
    .filter((t) => t.status === "done" && !t.announced)
    .sort((a, b) => Date.parse(a.endsAt) - Date.parse(b.endsAt));
}

export function markAnnounced(session: BenchSession, timerId: string): BenchSession {
  if (!session.timers.some((t) => t.id === timerId && !t.announced)) return session;
  return { ...session, timers: session.timers.map((t) => (t.id === timerId ? { ...t, announced: true } : t)) };
}

/** Stop the flash on finished timers (next user utterance, or a tap on one). */
export function dismissFinished(session: BenchSession, timerId?: string): BenchSession {
  if (!session.timers.some((t) => t.status === "done" && !t.dismissed && (!timerId || t.id === timerId))) return session;
  return {
    ...session,
    timers: session.timers.map((t) => (t.status === "done" && !t.dismissed && (!timerId || t.id === timerId) ? { ...t, dismissed: true } : t)),
  };
}

/** reply.create instructions for a finished timer (brief §8.6 step 2). */
export function announcementInstructions(session: BenchSession, timer: Timer, now: Date = new Date()): string {
  const total = session.protocol.steps.length;
  const where = session.currentStep > 0 ? `They are on step ${session.currentStep} of ${total}.` : "They haven't started the protocol steps yet.";
  const lateBy = Math.round((now.getTime() - Date.parse(timer.endsAt)) / 1000);
  const late = lateBy >= 60 ? ` It actually finished ${formatDurationSpoken(lateBy)} ago, while the connection was down; say so.` : "";
  return `In one short sentence, tell the user their '${timer.label}' timer (${formatDurationSpoken(timer.durationSeconds)}) has finished. ${where}${late}`;
}
