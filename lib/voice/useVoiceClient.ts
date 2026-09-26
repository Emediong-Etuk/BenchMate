"use client";

import { useEffect, useRef, type RefObject } from "react";
import { useVoiceStore } from "@/lib/store/voiceStore";
import { VoiceClient, type LogEntry, type VoiceClientHandlers } from "./VoiceClient";

const LOG_FLUSH_MS = 200;
const AUDIO_SUMMARY_MS = 1000;

/** One VoiceClient per mounted page, wired into the voice store. */
export function useVoiceClient(extra: Partial<VoiceClientHandlers> = {}): RefObject<VoiceClient | null> {
  const ref = useRef<VoiceClient | null>(null);
  const extraRef = useRef(extra);
  useEffect(() => {
    extraRef.current = extra;
  });

  useEffect(() => {
    const store = useVoiceStore.getState;

    // Audio frames arrive in bursts of hundreds; one debug row per frame
    // re-renders the log constantly. Summarise audio once a second and batch
    // everything else.
    let pendingLogs: LogEntry[] = [];
    const audio = { inN: 0, inB: 0, outN: 0, outB: 0 };
    const logTimer = setInterval(() => {
      if (pendingLogs.length) {
        store().addLogs(pendingLogs);
        pendingLogs = [];
      }
    }, LOG_FLUSH_MS);
    const audioTimer = setInterval(() => {
      if (!audio.inN && !audio.outN) return;
      const kib = (b: number) => (b / 1024).toFixed(1);
      pendingLogs.push({
        at: Date.now(),
        dir: "local",
        type: "audio/s",
        detail: `↑ ${audio.outN} chunks ${kib(audio.outB)} KiB · ↓ ${audio.inN} chunks ${kib(audio.inB)} KiB`,
      });
      audio.inN = audio.inB = audio.outN = audio.outB = 0;
    }, AUDIO_SUMMARY_MS);
    const onLog = (entry: LogEntry) => {
      if (entry.bytes !== undefined) {
        if (entry.dir === "in") {
          audio.inN++;
          audio.inB += entry.bytes;
        } else {
          audio.outN++;
          audio.outB += entry.bytes;
        }
        return;
      }
      pendingLogs.push(entry);
    };

    const client = new VoiceClient({
      onConnection: (state, message) => store().setConnection(state, message),
      onEvent: (ev) => store().applyEvent(ev),
      onLog,
      onPlayingChange: (p) => store().setPlaying(p),
      onMicLevel: (l) => store().setMicLevel(l),
      onReplyAudioStart: (id, at) => store().replyAudioStarted(id, at),
      onPendingToolResults: (n) => store().setPendingToolResults(n),
      onToolCall: (call) => {
        const fn = extraRef.current.onToolCall;
        if (!fn) throw new Error(`Tool '${call.name}' is not available yet.`);
        return fn(call);
      },
      onToolResultSent: (id) => extraRef.current.onToolResultSent?.(id),
      onToolResultsDropped: (ids) => extraRef.current.onToolResultsDropped?.(ids),
    });
    ref.current = client;
    const onPageHide = () => client.endOnPageHide();
    window.addEventListener("pagehide", onPageHide);
    return () => {
      clearInterval(logTimer);
      clearInterval(audioTimer);
      window.removeEventListener("pagehide", onPageHide);
      void client.dispose();
      ref.current = null;
    };
  }, []);

  // Callers read ref.current inside event handlers (after mount), not during render.
  return ref;
}
