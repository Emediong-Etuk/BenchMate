"use client";

import { useEffect, useRef, useState } from "react";
import { LevelMeter } from "@/components/ui/LevelMeter";
import { Capture, CaptureError } from "@/lib/voice/capture";
import { Playback } from "@/lib/voice/playback";

/** Live mic level + a test tone through the playback path (brief §11.3). */
export function MicCheck({ autoGainControl, volume }: { autoGainControl: boolean; volume: number }) {
  const captureRef = useRef<Capture | null>(null);
  const playbackRef = useRef<Playback | null>(null);
  const [level, setLevel] = useState(0);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rate, setRate] = useState<number | null>(null);

  useEffect(() => {
    return () => {
      void captureRef.current?.stop();
      void playbackRef.current?.close();
    };
  }, []);

  async function toggleMic() {
    setError(null);
    if (running) {
      await captureRef.current?.stop();
      setRunning(false);
      setLevel(0);
      return;
    }
    const cap = (captureRef.current ??= new Capture());
    try {
      await cap.start({ autoGainControl, onChunk: () => undefined, onLevel: setLevel });
      setRate(cap.contextSampleRate);
      setRunning(true);
    } catch (err) {
      setError(err instanceof CaptureError ? err.message : "Couldn't start the microphone.");
    }
  }

  async function testVoice() {
    const pb = (playbackRef.current ??= new Playback());
    await pb.init();
    pb.setVolume(volume);
    pb.playTone(523, 0.25, 0);
    pb.playTone(659, 0.25, 0.22);
    pb.playTone(784, 0.4, 0.44);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={toggleMic}
          className={`min-h-14 rounded-2xl border-2 px-5 font-semibold ${running ? "border-accent text-accent" : "border-border"}`}
        >
          {running ? "Stop mic check" : "Check microphone"}
        </button>
        <button type="button" onClick={testVoice} className="min-h-14 rounded-2xl border-2 border-border px-5 font-semibold">
          Test voice
        </button>
      </div>
      <LevelMeter level={level} />
      <p className="text-sm text-muted">
        {running
          ? `Speak normally from where you'll stand. The bar should move well past a third.${rate ? ` (capture at ${rate / 1000} kHz)` : ""}`
          : "Check the level from your bench position, and make sure the test tone is audible over the room."}
      </p>
      {error && <p className="text-sm text-bad">{error}</p>}
    </div>
  );
}
