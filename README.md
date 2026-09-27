# BenchMate

Hands-free voice lab assistant built on the AssemblyAI Voice Agent API. See `PLAN.md` for the build plan and `NOTES.md` for verified API behaviour.

> Work in progress: Phases 1–5 complete (voice loop; protocols, Home, Setup; tools and hands-free bench mode; timers with proactive announcements; notebook entry with exports).

## Setup

```bash
npm install
cp .env.example .env.local   # then set ASSEMBLYAI_API_KEY (and LLM_GATEWAY_MODEL)
npm run dev                  # http://localhost:3000
```

Use Chrome or Edge. The microphone needs `localhost` or HTTPS.

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

Keyboard fallbacks on the bench screen: Space mute, ← → steps, T type instead of speaking, D debug panel.

## Testing the parser's safety net

Start the server with `BENCHMATE_DEBUG=1` and send a parse request with the header `x-benchmate-debug: mangle`. The server drops one quantity from the parsed steps, and the Setup screen must show the "Some values may have been lost" warning. The hook is ignored unless that env var is set.

## Privacy

Lab data stays in this browser's local storage. Audio and protocol text are sent to AssemblyAI only for the live voice session and protocol parsing. The API key stays on the server and only single-use, short-lived tokens reach the browser.
