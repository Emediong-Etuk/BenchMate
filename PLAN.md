# BenchMate: build plan

Read with `NOTES.md` (verified API facts and the contradictions with the brief). **Waiting for approval before Phase 1.**

## Dependencies (unchanged from brief §3, no additions)

Runtime: `next`, `react`, `react-dom`, `zustand`, `zod`.
Dev: `typescript`, `tailwindcss` + `@tailwindcss/postcss`, `eslint` + `eslint-config-next`, `vitest`, `ajv`.

No other packages, by design:
- **Markdown rendering** on the entry page: none. The page renders the same structured entry model as JSX tables. `generateEntry.ts` produces the Markdown string for copy/download. Both come from one deterministic `buildEntryModel(session)`.
- **Passcode cookie signing:** Web Crypto HMAC in middleware.
- **IDs:** `crypto.randomUUID()`.
- **Chime:** OscillatorNode.
- **Snapshots:** vitest built-in.
- The `ws` package was used only for a throwaway resume probe in the scratchpad. It's not a project dependency.

## File tree

```
benchmate/
├─ app/
│  ├─ layout.tsx                    # fonts, theme tokens, privacy footer
│  ├─ globals.css                   # Tailwind v4 + print stylesheet
│  ├─ page.tsx                      # Home
│  ├─ setup/page.tsx                # Review/edit protocol, samples, mic check
│  ├─ bench/page.tsx                # Hands-free bench mode
│  ├─ entry/[sessionId]/page.tsx    # Notebook entry + exports
│  ├─ passcode/page.tsx
│  └─ api/
│     ├─ voice-token/route.ts
│     ├─ parse-protocol/route.ts
│     └─ passcode/route.ts          # sets signed cookie
├─ middleware.ts                    # DEMO_PASSCODE gate (no-op when unset)
├─ components/
│  ├─ bench/ StepCard, StatusPill, TimerPanel, LogFeed, CaptionStrip,
│  │         SettingsDrawer, DebugPanel, FirstRunTips
│  ├─ setup/ StepEditor, KeytermChips, SamplesField, MicCheck
│  └─ ui/    Button, LevelMeter, Banner
├─ lib/
│  ├─ voice/
│  │  ├─ VoiceClient.ts             # socket state machine, routing, reconnect
│  │  ├─ toolResultQueue.ts         # pure reducer: lastEvent + pending + commit status
│  │  ├─ proactiveSpeech.ts         # pure reducer: announcement queue
│  │  ├─ agentStatus.ts             # pure: derive status pill from events/playback
│  │  ├─ captions.ts                # pure: agent word reveal by start_ms
│  │  ├─ capture.ts                 # getUserMedia + worklet + level meter
│  │  ├─ playback.ts                # scheduled buffers, gain, duck, flush, chime
│  │  ├─ pcm.ts                     # resample, float↔int16, base64 (pure)
│  │  └─ events.ts                  # zod schemas for every server event
│  ├─ agent/
│  │  ├─ buildSessionConfig.ts
│  │  ├─ systemPrompt.ts
│  │  ├─ tools.ts
│  │  ├─ toolHandlers.ts            # pure (state, args, ctx) => {nextState, result}
│  │  ├─ keyterms.ts
│  │  ├─ transcriptionPrompt.ts
│  │  ├─ units.ts
│  │  └─ format.ts                  # human durations, readbacks, sample ranges
│  ├─ protocol/
│  │  ├─ types.ts  schema.ts (zod)  fallbackParser.ts  numberCheck.ts
│  │  ├─ llmParse.ts                # gateway call w/ response_format → prompt-only retry
│  │  └─ samples/ demoMock.ts  miniprep.ts  pcrSetup.ts
│  ├─ notebook/
│  │  ├─ entryModel.ts              # deterministic model (tables, audit)
│  │  └─ generateEntry.ts           # Markdown + JSON export from the model
│  ├─ store/
│  │  ├─ benchStore.ts              # zustand
│  │  └─ persistence.ts             # debounced localStorage, pagehide flush, 20-session cap
│  └─ server/
│     ├─ rateLimit.ts
│     └─ passcode.ts                # HMAC sign/verify (Web Crypto)
├─ public/worklets/pcm-capture.js
├─ scripts/
│  ├─ probe-voice.mjs               # recon probe (kept as a dev harness)
│  └─ check-secrets.mjs             # greps .next/static for key / var name
├─ tests/                           # vitest, one file per lib module
├─ NOTES.md  PLAN.md  README.md  .env.example
```

## Key design decisions

1. **One source of truth.** The zustand store holds protocol, position, entries, timers, and transcript. Tool handlers are pure functions over the store's `BenchSession`. `VoiceClient` never mutates data directly. It calls `dispatchTool(name, args, ctx)` → store.
2. **Tool-result queue = the commit ledger.** `toolResultQueue.ts` is a pure reducer over events (`tool.call`, `handler_done`, `reply.started`, `input.speech.started`, `reply.done{status}`) that emits `send` effects and entry status transitions `pending → confirmed | unconfirmed`, with the 60 s dedup against unconfirmed entries (canonicalized args: sorted keys, trimmed/lowercased strings, normalized units). The four §10.3 sequences are unit tests.
3. **Barge-in (NOTES C8).** Duck on `input.speech.started`, flush on `reply.done(interrupted)`, restore if not interrupted.
4. **Captions (NOTES §2 events).** Agent words are revealed by `start_ms` relative to when that reply's first buffer actually starts playing. They're cleared on flush.
5. **Status pill** is a pure function of (socket state, last events, pending results, `playback.isPlaying`, muted), so it's testable.
6. **Recovery (NOTES C5).** On an unexpected close: Reconnecting → fresh token → try `session.resume` once → on any resume error (or 1006) → fresh session with the reconnect greeting + a `conversation.message{role:"system"}` state summary. Retryable errors back off 1/2/4/8 s, then a manual Retry button. Rollover at `expires_at − 5 min` at the next idle moment.
7. **Keyboard/debug actions go through the same handlers.** Arrow-key navigation calls `navigate_protocol`'s handler directly, then informs the agent via `conversation.message{role:"system"}` (no reply).
8. **Voice defaults:** voice `alba`, `transcription_mode: balanced`, `voice_focus: far-field`, noise suppression off (NOTES C1–C3).

## Phases and acceptance checks

Each phase ends with `npm run typecheck && npm run lint && npm test` green, a commit, a push to `claude/vibrant-thompson-evxrno`, and a short "what works / how to try it" summary. I stop after each phase.

**Phase 1: Voice loop**
- Next.js 16 App Router scaffold (TS strict, Tailwind v4, ESLint, vitest). Pin TypeScript to the newest version Next + typescript-eslint support.
- `/api/voice-token` (Bearer key, 120 s / 10800 s, in-memory rate limit 10 per IP per 10 min).
- `pcm.ts` + tests. Capture worklet (24 kHz on Chromium, resample otherwise). `playback.ts` (scheduling, GainNode, duck, flush, "is playing" tracking).
- `events.ts` zod schemas. `VoiceClient` with a minimal prompt: connect, 12 s ready guard, mic streaming after ready, mute, `session.end` on stop and on `pagehide`.
- A temporary `/bench` dev view: status pill, captions, debug panel (event log without audio bodies, typed-utterance box → `conversation.message` + `reply.create`).
- `npm run check:secrets`.
- ✅ Talk to it over laptop speakers without self-interruption · ✅ barge-in cuts audio instantly · ✅ check:secrets passes.
- Headless Chrome can't do real mic tests. I'll verify the text harness and API flow here; the speaker/mic checks need you on a real laptop.

**Phase 2: Protocols**
- Types + zod schema. Three original sample protocols (demo mock 8 steps, miniprep ~14, PCR ~10). `fallbackParser`, `numberCheck` + tests.
- `/api/parse-protocol`: 20k char cap, gateway call (schema first, prompt-only retry), zod, fallback, number check, `request_id` logging.
- Home (3 cards + recent sessions) and Setup (step editor, missing-numbers banner, keyterm chips with the 100 cap count, samples with ranges, researcher name, mic check + test tone, Start).
- ✅ Pasting yields editable steps · ✅ a mangled parse shows the missing-numbers warning.

**Phase 3: Tools and bench mode**
- Store + persistence skeleton, `tools.ts` (+ ajv/lint tests), `toolHandlers.ts` (+ exhaustive tests), `units.ts`, result queue with commit semantics (+ the 4 sequences), full system prompt, keyterms (+ tests), transcription prompt, `buildSessionConfig` (+ limit tests).
- Bench UI: step card with prev/next ghosts, progress, log feed (pending/unconfirmed/voided styling), captions, keyboard fallbacks, wake lock, first-run tips.
- ✅ Manual script 1–8 by voice · ✅ all unit tests.

**Phase 4: Timers and proactive speech**
- Timer engine (store-driven, `endsAt`-based), chime ×3, flashing card, `proactiveSpeech.ts` reducer (+ tests), list/cancel with fuzzy match.
- ✅ Script step 9 · ✅ multiple timers · ✅ announcements never talk over the user.

**Phase 5: Notebook entry**
- `entryModel.ts` + `generateEntry.ts` (+ snapshot test with a fixture session). Entry page: copy MD, download MD/JSON, print stylesheet.
- ✅ Script step 12 · ✅ Markdown pastes cleanly · ✅ snapshot passes.

**Phase 6: Resilience**
- Debounced persistence + pagehide flush + 20-session cap + storage-full warning. Reload restore. Reconnect/resume/fresh-session path. Rollover. Backoff. Offline-fired timers announced after reconnect. Designed error states (no stack traces).
- ✅ Script 10 (10 s Wi-Fi drop) and 11 (reload).

**Phase 7: Polish and ship**
- Glanceability pass, dark mode, passcode gate, README (setup, architecture diagram, verbatim demo script, manual test script, privacy statement, known limitations), Vercel deploy.
- ✅ Deployed HTTPS URL works in a fresh profile. I can't deploy to Vercel from this container without your Vercel account, so either you connect the repo in Vercel or you give me a token. I'll prepare everything else.

## Open questions (need your call)

**Q1: LLM Gateway model.** This API key only reaches `qwen3.5-4b-32k-fast`, which doesn't support `response_format`. It still returned correct JSON when prompted, and json-repair + zod + number check + fallback cover failures. Options: (a) proceed with qwen now and switch to `claude-sonnet-4-6` via env var once the account has access (**recommended**; the code handles both); (b) you enable Claude/Gemini access on the account first so the demo shows true structured outputs.

**Q2: Resume.** `session.resume` failed in every variant I tried (NOTES C5). I'll implement it as documented but make the fresh-session reconnect the path that must pass Phase 6. OK? Worth asking AssemblyAI support. Session IDs from the probes are in my logs if you want to report it.

**Q3: System prompt edits.** I'd add (i) the docs' default-to-call line ("When in doubt, call the tool…") and (ii) ~6 one-line few-shot examples (e.g. `User: "go to step 2" → call navigate_protocol {action:"goto", step_number:2}, then read "Step 2. …"`). Everything else stays verbatim from §9.2. OK?

**Q4: The API key is in the chat transcript.** It's stored only in the gitignored `.env.local` and never committed. Because it was pasted into a conversation, I'd **rotate it** in the AssemblyAI dashboard after the hackathon (or now) and put the new one in `.env.local` / Vercel env.

Smaller defaults I'll use unless you object: voice `alba`, `far-field`, AGC off, flush-by-duck barge-in (NOTES C1–C3, C8). TypeScript is pinned to whatever Next 16 supports.
