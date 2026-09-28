# BenchMate

**Gloves on. Hands full. Notebook still gets written.**

BenchMate is a hands-free voice lab assistant for bench scientists, built on the [AssemblyAI Voice Agent API](https://www.assemblyai.com/docs/voice-agents/voice-agent-api). Load a protocol, put your gloves on, and talk to it:

| You say | BenchMate does |
|---|---|
| "Start" · "Next" · "Say that again" · "Go back" · "Go to step 9" | Reads the exact step text |
| "What speed was that spin?" | Answers with the exact value from the protocol |
| "Sample two, 245 nanograms per microliter, 260 over 280 is 1.86" | Logs both readings and reads them back |
| "Done, but I spun for three minutes, not one" | Logs a deviation, then moves to the next step |
| "Tube four looks cloudy" | Logs an observation |
| "Ten-minute timer for the incubation" | Starts a timer; announces it aloud when it ends |
| "Scratch that" · "No, 254 not 245" | Voids the last entry (kept for audit) · corrects it |
| "Louder" | Raises the agent's volume |
| "I'm done" | Confirms, ends the session, shows a clean notebook entry |

**Live demo:** https://bench-mate-rho.vercel.app

**Data integrity comes first.** The app, not the LLM, holds the protocol, your position and every logged value. The agent changes them only through tools. Every value is read back. Nothing is hard-deleted. The notebook entry is generated deterministically from the log, never written by an LLM.

## AssemblyAI features used

- **Voice Agent API** over WebSocket from the browser (single-use temporary tokens minted server-side).
- **Real-time STT** with protocol-specific `keyterms` and a `transcription_prompt`.
- **Semantic turn-taking and barge-in**: talking over BenchMate cuts its audio instantly; "uh-huh" doesn't.
- **JSON-Schema tool calling**: 10 client-side tools (navigate, record, deviate, observe, void, timers, volume, finish), ajv-checked in tests.
- **Proactive speech** via `reply.create` for timer announcements that never talk over you.
- **LLM Gateway** turns pasted protocol text into structured steps (structured output when the model supports it, JSON repair, and a quantity check that catches dropped values).

## Demo script (90 seconds)

1. (0:00) Title card: "Gloves on. Hands full. Notebook still gets written."
2. (0:05) Show the problem: scribbled glove, paper towel with numbers.
3. (0:12) Load "Demo: Mock bench run". Put gloves on. Say "Start."
4. (0:18) "Next" through two steps; interrupt a long step with "wait, say that again".
5. (0:30) "Sample one, 182 nanograms per microliter, 260 over 280 is 1.91." Readback.
6. (0:40) "Sample two, 245." It asks for the unit. "Nanograms per microliter." Readback.
7. (0:48) "Done, but I spun for two minutes instead of one." Deviation logged.
8. (0:55) "One-minute timer." Cut ahead; timer ends; BenchMate announces it.
9. (1:05) "Tube two looks cloudy." Then "Scratch that." Voided.
10. (1:12) "I'm done." "Yes." Notebook entry appears; scroll the tables and the audit section.
11. (1:25) Closing card: "Built on AssemblyAI Voice Agent API: real-time STT, turn-taking, tool calling, LLM Gateway."

## Quick start

Requirements: Node.js 20.9+, Chrome or Edge (desktop). The microphone needs `localhost` or HTTPS.

```bash
git clone https://github.com/Emediong-Etuk/BenchMate.git
cd BenchMate
npm install
cp .env.example .env.local      # Windows: copy .env.example .env.local
# edit .env.local (see below)
npm run dev                     # http://localhost:3000
```

| Variable | Required | Notes |
|---|---|---|
| `ASSEMBLYAI_API_KEY` | yes | Server-only. Never sent to the browser (`npm run check:secrets` verifies the build). |
| `LLM_GATEWAY_MODEL` | no | Protocol parser model. Default `claude-sonnet-4-6`. Use a model your account can access. We developed on `qwen3.5-4b-32k-fast` (see [NOTES.md](NOTES.md) C4). |
| `DEMO_PASSCODE` | no | If set, the whole app (pages and API) sits behind this passcode. |

Use laptop speakers, not headphones: the browser's echo cancellation keeps BenchMate from hearing itself.

## Deploy to Vercel

1. In Vercel, choose **Add New → Project** and import the repo (framework: Next.js, no build settings needed).
2. Add the environment variables above (Production and Preview). Set `DEMO_PASSCODE` for a public demo URL.
3. Deploy. The mic works because Vercel serves HTTPS.
4. Open the URL in a fresh browser profile and run the manual voice test script below.

## Manual voice test script (run before the demo)

1. "Start" → reads step 1 verbatim.
2. Interrupt mid-read with "wait, stop" → audio cuts immediately.
3. "Uh-huh" while it's reading → it keeps going (back-channel).
4. "Next" ×2, "go back", "go to step 5", "where am I".
5. "Sample two, 245 nanograms per microliter, 260 over 280 is 1.86" → two entries, correct readback.
6. "No, 254 not 245" → void + re-log + corrected readback.
7. "Done, but I spun for three minutes instead of one" → deviation logged, then advances.
8. "Tube four looks cloudy" → observation.
9. "One-minute timer" → countdown; talk during the last seconds and confirm the announcement waits until you finish.
10. Kill Wi-Fi for 10 s → Reconnecting → resumes or restarts with state intact.
11. Reload the page mid-run → state restored.
12. "I'm done" → confirmation → entry page with everything correct. Repeat 5 and 9 with a running fan or white-noise video nearby to simulate a centrifuge.

Keyboard fallbacks on the bench screen: **Space** mute · **← →** steps · **T** type instead of speaking · **D** debug panel (event log + typed input, useful as an on-stage backup if the mic fails).

## Architecture

```
┌──────────────────────── Browser (Chrome/Edge) ─────────────────────────┐
│  Mic → AudioWorklet → resample → 24 kHz PCM16 → base64 ──┐             │
│                                                          ▼             │
│  VoiceClient  (socket state machine)                                   │
│    ├─ event router → captions, status pill                             │
│    ├─ tool calls → ledger (pending/confirmed/unconfirmed, dedup)       │
│    │                → pure tool handlers → zustand store               │
│    ├─ tool-result queue (send only after reply.done)                   │
│    ├─ proactive speech gate (timer announcements, rollover)            │
│    └─ reconnect: fresh token → resume → fresh session + state summary  │
│  Playback: scheduled 24 kHz buffers, duck on speech, flush on barge-in │
│  Store: protocol, session, entries, timers, transcript → localStorage  │
└──────────────┬─────────────────────────────────┬───────────────────────┘
               │ GET /api/voice-token            │ POST /api/parse-protocol
┌──────────────▼─────────────────────────────────▼───────────────────────┐
│ Next.js route handlers (hold ASSEMBLYAI_API_KEY)                       │
│  - mint single-use tokens (rate-limited)                               │
│  - LLM Gateway parse → zod → quantity check → rule-based rescue        │
│ proxy.ts: optional DEMO_PASSCODE gate (signed cookie)                  │
└────────────────────────────────────────────────────────────────────────┘
       Browser ⇄ wss://agents.assemblyai.com/v1/ws?token=…  (direct)
```

| Path | What lives there |
|---|---|
| `app/` | Pages (home, setup, bench, entry, passcode), API routes, error pages |
| `components/` | Bench (step card, log feed, timers, captions, settings, debug), setup, entry |
| `lib/voice/` | `VoiceClient`, capture/playback, PCM helpers, event schemas, result queue, proactive speech, reconnect policy |
| `lib/agent/` | Tool schemas and handlers, commit ledger, system prompt, session config, keyterms, units, speakable text, timers |
| `lib/protocol/` | Types, samples, LLM parse pipeline, rule-based parser, quantity check |
| `lib/notebook/` | Deterministic entry model + Markdown/JSON export |
| `lib/store/` | zustand stores and localStorage persistence |
| `tests/` | Vitest unit tests (tool handlers, ledger sequences, schemas, parsers, notebook snapshot, …) |

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build / server |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm run lint` | ESLint (Next config) |
| `npm test` | Vitest unit tests |
| `npm run check:secrets` | After a build: fails if the API key or its variable name is in client-facing output |
| `npm run probe` | Logs real Voice Agent API payloads (`scripts/probe-voice.mjs`) |

## Privacy

Lab data (protocols, logged values, transcripts, notebook entries) stays in this browser's local storage. Audio is sent to AssemblyAI only for the live voice session, and pasted protocol text only for parsing. The API key never leaves the server; the browser only gets single-use tokens that expire in 120 seconds. There are no accounts, databases or cloud storage.

## What we learned about the API (and changed from the brief)

The build follows the brief except where the live API behaved differently. Everything below was verified with probes; details are in [NOTES.md](NOTES.md).

- **Tool arguments must be words the user said.** On the voice path, a tool call with free-text values the user didn't say (a `"concentration"` label, units written `ng/µL`) makes the reply come back silently empty. So `record_measurement` takes one reading per call, with an enum for the quantity and the unit in spoken words; the app normalizes units for the record. "Scratch that" voids everything from the same utterance.
- **`conversation.message` has no effect,** so typed input goes through `reply.create` instructions, and reconnect context (current step, recent log, running timers) goes into the system prompt.
- **`session.resume` never succeeded,** so recovery after a drop starts a fresh session that is told the current state. Nothing is lost because the app owns the data.
- **Sessions last about an hour** (`expires_at`), whatever the token requests; BenchMate rolls over to a new session 5 minutes before.
- **Numbers are spoken as words** in tool results (e.g. "thirteen thousand times g"), because the voice read "13,000" digit by digit.
- The default voice is `alba` (the brief's `ivy` isn't a documented voice), microphone noise suppression is off and voice focus is `far-field`, per the docs.

## Known limitations

- Chrome and Edge on desktop are the supported browsers. Firefox should work (it resamples at the device rate), Safari is untested.
- Sessions live in one browser's local storage; clearing site data deletes them. Export entries (Markdown/JSON) to keep them.
- After a page reload the browser may need one tap to resume audio (autoplay policy); BenchMate shows a full-screen prompt.
- The small LLM Gateway model available on our account sometimes drops protocol steps; the quantity check catches it and falls back to the rule-based split. A stronger model (for example `claude-sonnet-4-6`) gives better parses.
- The agent's model occasionally misfiles free talk as an observation; everything is visible in the log and can be voided.

## Troubleshooting

- **"Voice service is not configured"**: `ASSEMBLYAI_API_KEY` is missing. Restart the server after editing `.env.local`.
- **The agent interrupts itself**: you're probably on speakers without echo cancellation (another app holding the mic, or a Bluetooth headset profile). Use the laptop's built-in mic and speakers in Chrome.
- **It mishears reagent names**: add them as keyterms on the Setup screen.
- **Timers don't chime**: the page needs one interaction first; press Start listening.
