# BenchMate

Hands-free voice lab assistant built on the AssemblyAI Voice Agent API. See `PLAN.md` for the build plan and `NOTES.md` for verified API behaviour.

> Work in progress: Phases 1 (voice loop) and 2 (protocols, Home, Setup) complete.

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

## Testing the parser's safety net

Start the server with `BENCHMATE_DEBUG=1` and send a parse request with the header `x-benchmate-debug: mangle`. The server drops one quantity from the parsed steps, and the Setup screen must show the "Some values may have been lost" warning. The hook is ignored unless that env var is set.

## Privacy

Lab data stays in this browser's local storage. Audio and protocol text are sent to AssemblyAI only for the live voice session and protocol parsing. The API key stays on the server and only single-use, short-lived tokens reach the browser.
