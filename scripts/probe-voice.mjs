// Probe script: logs real Voice Agent API payloads (audio bodies redacted).
// Usage: node --env-file=.env.local scripts/probe-voice.mjs [scenario]
// Scenarios: tool (default), resume, config
const KEY = process.env.ASSEMBLYAI_API_KEY;
if (!KEY) throw new Error("ASSEMBLYAI_API_KEY missing");
const scenario = process.argv[2] ?? "tool";

async function token() {
  const url = "https://agents.assemblyai.com/v1/token?expires_in_seconds=120&max_session_duration_seconds=600";
  const res = await fetch(url, { headers: { Authorization: `Bearer ${KEY}` } });
  if (!res.ok) throw new Error(`token ${res.status} ${await res.text()}`);
  return (await res.json()).token;
}

const t0 = Date.now();
const log = (dir, msg) => {
  const m = { ...msg };
  if (typeof m.data === "string") m.data = `<${m.data.length} b64 chars>`;
  if (typeof m.audio === "string") m.audio = `<${m.audio.length} b64 chars>`;
  if (m.config) m.config = JSON.stringify(m.config).slice(0, 1500);
  console.log(`${String(Date.now() - t0).padStart(6)}ms ${dir} ${JSON.stringify(m)}`);
};

async function open(first) {
  const ws = new WebSocket(`wss://agents.assemblyai.com/v1/ws?token=${await token()}`);
  const send = (m) => { log(">>", m); ws.send(JSON.stringify(m)); };
  ws.addEventListener("open", () => send(first));
  ws.addEventListener("close", (e) => log("XX", { close: e.code, reason: e.reason }));
  ws.addEventListener("error", () => log("XX", { error: true }));
  return { ws, send };
}

const TOOL = {
  type: "function",
  name: "navigate_protocol",
  description: "Get the exact step text. Call whenever the user says next, repeat, go to a step.",
  parameters: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["next", "previous", "repeat", "goto", "current"], description: "Action." },
      step_number: { type: "integer", minimum: 1, description: "For goto." },
    },
    required: ["action"],
  },
  execution_mode: "interactive",
  timeout_seconds: 30,
};

const config = {
  system_prompt: "You are BenchMate. Replies are one short sentence. Always use navigate_protocol to read steps and read step_text verbatim.",
  greeting: "Probe ready.",
  tools: [TOOL],
  input: {
    language_codes: ["en"],
    keyterms: ["NanoDrop", "supernatant", "BenchMate"],
    transcription_prompt: "Molecular biology bench session with volumes in microliters.",
    transcription_mode: "balanced",
    voice_focus: "near-field",
  },
  output: { voice: "alba" },
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

if (scenario === "tool" || scenario === "config") {
  const { ws, send } = await open({ type: "session.update", session: config });
  let lastEvent = null; const pending = []; let injected = false;
  const flush = () => { if (lastEvent !== "reply.done") return; while (pending.length) send(pending.shift()); };
  ws.addEventListener("message", (e) => {
    const msg = JSON.parse(e.data); log("<<", msg);
    if (msg.type === "reply.started" || msg.type === "input.speech.started") lastEvent = msg.type;
    if (msg.type === "tool.call") {
      pending.push({ type: "tool.result", call_id: msg.call_id, result: JSON.stringify({ ok: true, step_number: 2, total_steps: 8, step_text: "Add 50 microliters of blue water to tube 2." }) });
      flush();
    }
    if (msg.type === "reply.done") {
      lastEvent = "reply.done";
      if (msg.status === "interrupted") pending.length = 0; else flush();
      if (!injected && scenario === "tool") {
        injected = true;
        send({ type: "conversation.message", role: "user", content: "Go to step 2." });
        send({ type: "reply.create" });
      }
    }
  });
  await wait(scenario === "tool" ? 20000 : 6000);
  send({ type: "session.end" });
  await wait(3000);
  ws.close();
}

if (scenario === "resume") {
  const a = await open({ type: "session.update", session: config });
  let sid = null; let rt = null;
  a.ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.type !== "reply.audio") log("<<A", m); if (m.type === "session.ready") { sid = m.session_id; rt = m.resume_token; } });
  await wait(5000);
  console.log("--- abrupt close, resuming with a fresh token ---");
  a.ws.close();
  await wait(2000);
  const variant = process.argv[3] ?? "plain";
  const msg = variant === "with_token" ? { type: "session.resume", session_id: sid, resume_token: rt } : { type: "session.resume", session_id: sid };
  const b = await open(msg);
  b.ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.type !== "reply.audio") log("<<B", m); });
  await wait(5000);
  b.send({ type: "session.end" });
  await wait(3000);
  b.ws.close();
}
process.exit(0);
