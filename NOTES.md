# BenchMate: recon notes

Phase 0 recon, 2026-09-26. I read these docs (fetched as `.md` from assemblyai.com/docs): Voice Agent overview, events reference, client-side tools, tools overview, browser integration, session configuration, audio format, turn detection, supported languages, voices, volume, noise suppression, transcription prompt / key terms, troubleshooting, token API reference, LLM Gateway quickstart, structured outputs, and available models. I skimmed the official JS starter (`AssemblyAI/voice-agent-starter-js`) for reference only.

I also ran live probes against the real API with the project key (`scripts/probe-voice.mjs`, plus throwaway scripts in the scratchpad). Payloads quoted below are **observed**, not only documented.

Legend: ✅ verified (docs + probe) · 📄 docs only · ⚠️ contradicts the brief · ❓ open

---

## 1. Contradictions with the brief (the docs/probes win)

| # | Brief says | Reality | What I'll do |
|---|---|---|---|
| C1 | Default voice `ivy` | ⚠️ `ivy` is **not** in the docs' voice list. English voices: `alba, eve, george, jane, jean, mary, michael` (US), `anna, charles, paul, vera` (UK). Probe: the server *accepts* `ivy` without error and echoes `"voice":"ivy"`, so we can't tell what voice actually plays. | Default to `alba` (the docs' own default in every example). Settings list = the 11 documented English voices. |
| C2 | `getUserMedia` with `noiseSuppression: true, autoGainControl: true` | ⚠️ Browser-integration and audio-format docs: **echo cancellation on, noise suppression off**. The server denoises already, and a second layer "introduces artifacts that hurt transcription accuracy more than the original noise did". The starter also sets `autoGainControl: false`. | `echoCancellation: true, noiseSuppression: false, channelCount: 1`. The docs say nothing about AGC; I'll default it **off** like the starter and expose it as an advanced setting (a quiet bench mic 1–2 m away may want it on). |
| C3 | `voice_focus` default `near-field` | ⚠️ Noise-suppression docs: `near-field` for headsets/handsets; `far-field` for "speakerphone, conference rooms, drive-thru, **laptop** and car mics". | Default `far-field` (a bench laptop is exactly that case). Keep it as a setting and test both, as the brief asks. |
| C4 | `LLM_GATEWAY_MODEL=claude-sonnet-4-6` with structured outputs | ⚠️ The model ID exists and supports `response_format`, **but this API key can't use it**: `400 "Your account does not have access to this LLM Gateway model"`. I tried all 37 listed models; only `qwen3.5-4b-32k-fast` returns 200, and it rejects `response_format` (`400 "model ... does not support response_format"`). Without a schema, with the shape described in the prompt, it did return clean, correct JSON (volumes, `13,000 x g`, durations 60/300). | Parse route is model-agnostic. Try `response_format: json_schema, strict: true` + `post_processing_steps: [{type:"json-repair"}]`. If the gateway answers "does not support response_format", retry once without it, with the schema in the prompt (still json-repair). Then zod, then the fallback parser. Log `request_id`, model, and which path ran. `.env.example` keeps `claude-sonnet-4-6`; for this key `.env.local` uses `qwen3.5-4b-32k-fast`. **See Q1.** |
| C5 | `session.resume` within 30 s restores the session | ⚠️ Every probe failed with `session_not_found` ("Session not found or grace window has expired") 2–3 s after the drop. Variants tried: clean client close (1005); hard TCP drop via `ws.terminate()` (1006, a true network drop); fresh temp token; the `resume_token` from `session.ready` as the socket token (authenticates, still not found); `resume_token` in the resume message; API-key header auth instead of temp tokens. | Keep the documented resume attempt (it costs ~50 ms to fail) but treat **fresh session + reconnect config + state summary** as the real recovery path. Phase 6 acceptance relies on that path. **See Q2.** |
| C6 | Tool replies have `reply_id` `fc-<call_id>` (docs) | ⚠️ Observed: the reply after our `tool.result` had an ordinary `reply_id: "resp_…"`. Tool `call_id`s look like `chatcmpl-tool-8b12f548695cb126`. | Never correlate replies to tools by `reply_id`. The `lastEvent` queue doesn't need it. |
| C7 | `session.error.timestamp` is an ISO string (docs example) | ⚠️ Every observed event carries `timestamp` as a **float epoch-seconds number** (e.g. `1790461857.96`). | zod: `timestamp: z.union([z.number(), z.string()]).optional()`. |
| C8 | Flush playback only on `reply.done(interrupted)` | 📄 The turn-detection docs also flush on `input.speech.started` ("snappiest barge-in"), and the starter does the same. But back-channels ("uh-huh") also start speech and **don't** interrupt, so flushing there would drop audio from a reply that keeps going (manual test step 3). | On `input.speech.started`: **duck** agent audio to ~15% gain (instant perceived barge-in). On `reply.done(interrupted)`: hard flush. If the reply isn't interrupted (no `reply.done(interrupted)` ~600 ms after `input.speech.stopped`), restore gain. |
| C9 | Brief's system prompt is used verbatim | 📄 The tools docs call few-shot examples in the system prompt "the strongest behavioural signal". Probe: with a minimal prompt, "Go to step 2." produced `navigate_protocol({action:"current"})` with no `step_number`, and the agent paraphrased the step ("The current step is to add fifty…") instead of "Step 2. …" verbatim. | Keep the brief's prompt and add a short few-shot block + the docs' default-to-call line. **See Q3.** |

| C10 | `conversation.message` injects context (dev text box, reconnect summary, keyboard-nav notices) | ⚠️ **Found in Phase 1: it has no observable effect.** Probes: `conversation.message {role:"user"}` + `reply.create` gets a generic reply ("I am ready to assist you…") that ignores the content. Same with `role:"system"`, with an 800–1500 ms gap before `reply.create`, and when later asked to recall it ("My name is Priya" → "I do not know your name"). `reply.create {instructions}` **does** work, including tool routing ("go to step 5" typed → `navigate_protocol {action:"goto", step_number:5}` → verbatim read). | Typed utterances go in `reply.create.instructions` ("The user typed this instead of speaking: …"). State context for the agent (reconnect summary, keyboard navigation) goes in the **mutable `system_prompt`** via `session.update`, not `conversation.message`. Phase 3 and 6 are designed around this. |
| C11 | Agent reads numbers correctly by default | ⚠️ Probe: with step text "Spin the tubes for 1 minute at 13,000 x g." the spoken transcript was "…at 1 3 0 0 0 x g." | Phase 3: tool results include a speakable form of each step (thousands separators expanded, e.g. "13,000 x g" → "thirteen thousand times g") next to the exact `step_text`. The prompt tells the agent to read the speakable form. The notebook keeps the exact text. |

| C12 | The LLM sets `duration_seconds` and preserves every step | ⚠️ **Phase 2, `qwen3.5-4b-32k-fast`:** (a) returned "30 minutes" as `30` and "40 minutes" as `40` (minutes, not seconds); (b) in one run it silently dropped the last two of six steps. (c) This account's Gateway rate limit is low: a retry within the same minute got `429 "too many requests for this action"`. | (a) Durations are derived deterministically from each step's text (a step gets a duration only if it states exactly one explicit duration, the brief's rule). Model disagreements are logged. (b) The number check is a quality gate: lost quantities → retry once → if still lossy and the rule-based split loses fewer, use it and keep the model's keyterms. The warning banner shows whatever remains missing. (c) A 429 falls through to the best available result. |

| C13 | `record_measurement` takes an array of readings with `unit` symbols like `ng/µL` and quantities like `260/280` (brief §10.1) | ⚠️ **Phase 3, biggest finding.** On the **voice** path, a reply whose tool call carries free-text string values the user didn't say (quantity `"concentration"`, unit `"ng/uL"`) comes back **empty**: `reply.started` → `reply.done completed`, no audio, no `tool.call`, no error. Bisected with streamed TTS audio: a flat tool with `value` + `sample_id` works; adding a unit written as spoken words (`"nanograms per microliter"`) works; a unit with a slash, or a free-text `quantity` the user didn't say, fails; `quantity` as an **enum** works. The nested `measurements` array failed even with those fixes. The typed/`reply.create` path doesn't show this. This fits the docs' "a spoken value that doesn't fit the shape is rejected before the tool runs", except that no re-ask happens. | `record_measurement` is **one reading per call** (the model makes one call per value), `quantity` is an **enum**, `unit` is **the user's own words** (optional). `units.ts` maps spoken words to `ng/µL` etc. for the record. Other free-text arguments (deviation, observation, timer label) ask for the user's own words and to omit anything unsaid. "Scratch that" voids **every entry from the same utterance** (entries carry a `groupId` per user turn), which keeps the brief's intent that a two-reading utterance is voided as a unit. The handler still accepts the array form. |
| C14 | One tool call per request | ⚠️ The model sometimes repeats an identical call 2–6 times in one turn. | Ledger same-turn guard: an identical state-changing call within one user turn replays the first result. A repeat in a new turn is applied (a repeated reading may be real). |
| C15 | TTS reads numbers naturally | ⚠️ "245" was sometimes read "2 4 5" and "13,000" digit by digit. Pauses inside one sentence can split it into two user turns. | `say` fields write integers ≥ 100 as words and ratios as "two sixty over two eighty". Split turns are fine now that each reading is its own call. |

| C16 | `max_session_duration_seconds` caps the session (default 10800 = 3 h); `expires_at` reflects it | ⚠️ **Phase 6:** `session.ready.expires_at` is always ≈ **1 hour** after ready (3594 s), whatever cap the token requests (probed with 60, 120, 600, 10800). A 60-second cap was **not enforced**: the session was still open at 95 s. | Rollover is timed from `expires_at` (at 55 min, 5 min before the hour). The token still requests 10800. For testing, localStorage `benchmate:debug-rollover-after-ms` triggers the rollover early (client-side, since the server ignores the cap). |

| C17 | "Scratch that" voids by utterance group; corrections reuse it | ⚠️ **Found testing the live deployment:** a measurement spoken with a pause arrives as **two turns** (two groups). "No, 254 not 245" then voided the most recent group, which was the *ratio*, not 245, so 245 and 254 both stayed live. | `void_last_entry` takes an optional `value`. A correction passes the wrong number and exactly that reading is voided; plain "scratch that" still voids the last utterance. Verified by voice for both the split-turn and single-turn shapes. |
| C18 | Semantic barge-in "on by default, nothing to wire up" | ⚠️ **Reported in use, then reproduced:** saying "wait, stop" while the agent read a step had no effect. Probes: the server interrupts in ~1 s when the voice arrives at full level (~0.66 × full scale or more while its reply plays), but not at ~1/3; `vad_threshold` 0.2/0.3 didn't help. In the browser, Chrome's echo canceller turns the user down during agent playback (double-talk): the same phrase arrived at ~10k peak vs ~21–32k when the agent was silent. Browser AGC didn't compensate (it clipped quiet-time speech and left double-talk low). A mid-reply `reply.create` does end the reply but isn't a documented cancel and produced odd follow-ups, so not used. | `lib/voice/bargeIn.ts`: while agent audio is audible the mic is boosted ×2.5 with a soft limiter, and sustained speech-level mic energy ducks the agent locally at once (less echo → less suppression). The server still decides semantically; `reply.done(interrupted)` still flushes. Verified in the browser: "wait, stop" mid-step → local duck, `reply.done interrupted`, playback stopped, transcript trimmed; "uh-huh" → brief duck, reply completes. Needs a real-laptop check for self-interruption from boosted residual echo. |

### Owner decision after launch: accounts

The brief (§21) said "Do not add accounts, databases, or cloud storage." After launch, the project owner chose to add them: sign-in with Google only (Auth.js v5), Postgres on Neon (Drizzle ORM), sign-in required for everything except Home and About, and sessions saved before accounts are ignored (not imported). The data-integrity rules are unchanged: the app, not the LLM, owns the record; nothing is hard-deleted inside a session (only the user can delete a whole session or their account); the notebook is still generated deterministically. The per-user data isolation is covered by `tests/userData.test.ts` (run with `TEST_DATABASE_URL`) and an end-to-end two-account run. The optional `DEMO_PASSCODE` gate was removed, since sign-in now guards every API route.

## 2. Verified facts

### Auth / tokens
- ✅ `GET https://agents.assemblyai.com/v1/token?expires_in_seconds=120&max_session_duration_seconds=10800` → `{"token": "...", "expires_in_seconds": 120}`. The docs say `Authorization: Bearer <key>`; a raw key also works. We'll use `Bearer`.
- 📄 `expires_in_seconds` 1–600 (redemption window only). `max_session_duration_seconds` 60–10800, default 10800.
- 📄 Token is single-use: one token = one session. **Resume needs a fresh token** (troubleshooting page: "each new WebSocket connection needs a new token"). This answers the brief's open question.
- 📄 Expired token → `session.error` code `unauthorized` on the first frame. In browsers, pre-handshake failures show up only as `close` 1006, with no `session.error`.
- The starter adds an undocumented `product=voice_agent` query param. Not used.

### Session lifecycle (observed order)
1. socket open → we send `session.update`
2. ✅ `session.updated` `{config, timestamp}` arrives **before** `session.ready` (~20 ms earlier)
3. ✅ `session.ready` `{session_id: "sess_…", config, expires_at: <epoch s>, resume_token: "<JWT-ish>", timestamp}`. `expires_at` = now + max duration.
4. ✅ Greeting starts right away: `reply.started` → `reply.audio`… → `transcript.agent.delta`… → `transcript.agent` → `reply.done{status:"completed"}`
5. ✅ `session.end` → `session.ended {session_duration_seconds, audio_duration_seconds (null if no audio sent), timestamp}` → close 1000.
- ✅ The resolved `config` object echoes `input.keyterms`, `input.transcription_prompt`, `turn_detection: null` (adaptive), `output.volume: null`, and per-tool extras (`http`, `response_instructions`, …).
- ✅ Resume failure: `session.error {code:"session_not_found", message, session_id:null, param:null}` then close 1008.

### keyterms + transcription_prompt
- ✅ **Compatible.** The docs say "Use them together". The probe sent both, and both show up in the resolved config with no error. The brief's §9.4 applies as written.
- 📄 Key-term guidance: rare/domain words only. "Common English words … dilute the boost". Whole phrases don't help (boost is per term). I'll trim the base vocab to the rarer items (NanoDrop, Qubit, OD600, supernatant, eluate, lysate, thermocycler, microcentrifuge, aliquot, BenchMate …) and drop words like "pellet" and "vortex" if we're over budget.
- 📄 `transcription_prompt`: give context, not instructions ("behavioral commands are ignored"). Max 1750 chars.

### Events (observed shapes)
- `transcript.agent.delta` ✅ `{reply_id, item_id, delta: "fifty ", start_ms, end_ms}`. `delta` includes trailing space. **All deltas for a reply arrive in one burst ~0.5 s after `reply.started`, well ahead of the audio** (transcript.agent came ~4 s later). Captions must be revealed using `start_ms` against the reply's playback start time, not appended on arrival.
- `transcript.agent` ✅ arrives only after all audio for the reply has been sent (can be seconds after the deltas).
- `tool.call` ✅ `{call_id, name, arguments: {…object…}}`, then `reply.done{completed}` ~260 ms later, then our `tool.result` → new `reply.started`. Exactly the documented `lastEvent` pattern.
- `reply.audio` ✅ field is `data`.
- `conversation.message {role:"user"}` + `reply.create` ✅ works as a text harness (it triggered the tool call).
- 📄 Retryable codes: `at_capacity`, `concurrency_exceeded`, `internal_error`. Everything else is fatal. Server-cancelled sessions can close 1011 with no `session.error`.
- 📄 `session.update` after ready: `greeting`, `output.voice`, `output.format` → `immutable_field`. `tools` replaces the whole array.

### Tools
- 📄 Fields: `type:"function"`, `name`, `description`, `parameters`, `execution_mode` (`interactive` default), `timeout_seconds` (1–300, default 120). Optional `response_instructions` (`success`/`error` guidance) exists.
- 📄 `parameters` not validated server-side → ajv in tests (as the brief planned).
- 📄 Property keywords `enum`, `examples`, `pattern`, `format` sharpen both tool-calling accuracy **and turn detection** (the agent waits for a complete value). I'll add `examples` to the numeric/sample fields.
- 📄 "Keep tool sets small (≤10 per phase)". We have exactly 10. OK, but don't add more.
- 📄 `tool.result.result` is a JSON **string**. `is_error` optional.

### Audio
- 📄 PCM16 LE mono 24 kHz, base64 in JSON. "Chunk size doesn't matter; ~50 ms works well." The brief's ~100 ms is fine.
- 📄 Faster than ~1 s audio per 1 s wall clock → frames dropped (`audio_rate_violation`).
- 📄 `AudioContext({sampleRate:24000})` is honoured on Chrome/Edge. Firefox honours it but **loses echo cancellation**, and Safari ignores it. Plan: on Chromium, try 24 kHz. On Firefox (or if the context isn't at 24 kHz), use the default rate and resample in the worklet. `pcm.ts` holds the tested resampler; the worklet mirrors it.
- Starter reference: plays via a ring-buffer AudioWorklet rather than scheduled `AudioBufferSourceNode`s ("drifts and clicks under jitter"). The brief asks for scheduled buffers + GainNode. I'll follow the brief but keep a ~80 ms jitter lead on the first chunk of each reply. If we hear clicks in Phase 1, I'll switch to the ring-buffer pattern (no new deps either way).

### Languages / voices
- 📄 Input: 18 languages (Universal-3.5 Pro Streaming). Output: English, Italian, Spanish, German, Portuguese, French.

### LLM Gateway
- ✅ `POST https://llm-gateway.assemblyai.com/v1/chat/completions`, header `authorization: <key>` (no Bearer in the docs examples). Response includes top-level `request_id`, `model`, `choices[0].message.content` (string, may have leading/trailing whitespace), and `usage`.
- ✅ Error body: `{metadata:{errors:[…]}, request_id, message, code}`.
- 📄 `response_format: {type:"json_schema", json_schema:{name, schema, strict:true}}`. Supported by Claude 4.5+, Gemini, GPT-4.1/5.x, Qwen, Kimi. But the accessible `qwen3.5-4b-32k-fast` rejects it (C4).
- 📄 `post_processing_steps: [{type:"json-repair"}]` works on all models. If repair fails the gateway returns HTTP 500.
- 📄 Model IDs in the docs: `claude-sonnet-4-6` ✅ listed with `response_format`. Note `claude-sonnet-5` / `claude-opus-5*` are listed **without** `response_format`.

### Session recordings (stretch goal 4)
- 📄 A sessions API exists (list / retrieve with recording + timeline / delete). Not verified for inline sessions yet; deferred to stretch.

### Tooling versions (npm, today)
next 16.3.6 · react 19.3.0 · tailwindcss 4.3.3 · zustand 5.0.15 · zod 4.6.5 · ajv 8.20.0 · vitest 5.0.2 · typescript 7.0.2 · eslint 10.11.0.
TypeScript 7 is the native port. If `next build`'s type check or typescript-eslint doesn't support it yet, I'll pin the latest 5.x/6.x. I'll check in Phase 1.

### Browser testing in this container
- Headless Chromium here can't trust the sandbox's TLS-intercepting egress CA (its NSS store is empty and there's no `certutil`). For automated end-to-end runs, the Playwright harness (scratchpad only, not a project dependency) bridges the page's WebSocket through Node, which trusts the CA bundle. The page code is unchanged. Real browsers on real networks connect directly.
- Fake mic: `--use-file-for-fake-audio-capture=<wav>` with a WAV recorded from the agent's own TTS gives a real spoken test utterance.

## 3. Open questions → PLAN.md §Open questions
Q1 LLM Gateway model access · Q2 resume behaviour · Q3 prompt few-shot addition · Q4 the API key pasted in chat.
