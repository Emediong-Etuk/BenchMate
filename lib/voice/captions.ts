// Agent caption timing. transcript.agent.delta words arrive in a burst well
// ahead of the audio (NOTES.md §2), so we reveal each word when playback
// reaches its start_ms, measured from when the reply's first audio played.

export type CaptionWord = { text: string; startMs: number | null };

export type AgentCaption = {
  replyId: string;
  words: CaptionWord[];
  /** performance.now() value when this reply's first audio started playing; null = not yet. */
  playbackStartedAt: number | null;
  /** Set once the reply finished; everything is shown. */
  final: boolean;
};

export function emptyCaption(replyId: string): AgentCaption {
  return { replyId, words: [], playbackStartedAt: null, final: false };
}

export function addWord(c: AgentCaption, text: string, startMs: number | null | undefined): AgentCaption {
  return { ...c, words: [...c.words, { text, startMs: startMs ?? null }] };
}

/** Text visible at `now` (a performance.now() value). */
export function visibleCaption(c: AgentCaption | null, now: number): string {
  if (!c) return "";
  if (c.final) return joinWords(c.words);
  if (c.playbackStartedAt === null) return "";
  const elapsed = now - c.playbackStartedAt;
  const shown: CaptionWord[] = [];
  for (const w of c.words) {
    // Words with no timing ride along with the previous word.
    if (w.startMs === null || w.startMs <= elapsed) shown.push(w);
    else break;
  }
  return joinWords(shown);
}

function joinWords(words: CaptionWord[]): string {
  // Observed deltas carry their own trailing space ("fifty "); some may not.
  let out = "";
  for (const w of words) {
    if (out && !/\s$/.test(out) && !/^\s/.test(w.text)) out += " ";
    out += w.text;
  }
  return out.trim();
}
