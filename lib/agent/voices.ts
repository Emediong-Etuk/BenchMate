// English voices from the docs' Voices page (NOTES.md C1). `ivy` from the
// brief is not a documented voice.
export const ENGLISH_VOICES = [
  { id: "alba", accent: "US" },
  { id: "eve", accent: "US" },
  { id: "george", accent: "US" },
  { id: "jane", accent: "US" },
  { id: "jean", accent: "US" },
  { id: "mary", accent: "US" },
  { id: "michael", accent: "US" },
  { id: "anna", accent: "UK" },
  { id: "charles", accent: "UK" },
  { id: "paul", accent: "UK" },
  { id: "vera", accent: "UK" },
] as const;

export type VoiceId = (typeof ENGLISH_VOICES)[number]["id"];
export const DEFAULT_VOICE: VoiceId = "alba";
