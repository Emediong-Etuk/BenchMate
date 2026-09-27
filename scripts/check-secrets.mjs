// Fails if the AssemblyAI API key (or its variable name) appears anywhere in
// the client-side build output. Run after `next build`.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const clientDirs = [".next/static"].map((d) => join(root, d));
// Also scan prerendered HTML/RSC payloads that are served to browsers.
const serverAppDir = join(root, ".next/server/app");

function loadKey() {
  if (process.env.ASSEMBLYAI_API_KEY) return process.env.ASSEMBLYAI_API_KEY;
  for (const f of [".env.local", ".env"]) {
    const p = join(root, f);
    if (!existsSync(p)) continue;
    const m = readFileSync(p, "utf8").match(/^ASSEMBLYAI_API_KEY=(.*)$/m);
    if (m && m[1].trim()) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  return null;
}

function* walk(dir, filter = () => true) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) yield* walk(p, filter);
    else if (filter(p)) yield p;
  }
}

if (!clientDirs.some(existsSync)) {
  console.error("check:secrets: no .next/static output found. Run `npm run build` first.");
  process.exit(2);
}

const key = loadKey();
const needles = ["ASSEMBLYAI_API_KEY", ...(key ? [key] : [])];
if (!key) console.warn("check:secrets: no key found in env/.env.local; checking the variable name only.");

const files = [
  ...clientDirs.flatMap((d) => [...walk(d)]),
  ...walk(serverAppDir, (p) => /\.(html|rsc|body|meta)$/.test(p)),
];

const hits = [];
for (const file of files) {
  const text = readFileSync(file, "utf8");
  for (const n of needles) if (text.includes(n)) hits.push({ file, what: n === key ? "API key value" : n });
}

if (hits.length) {
  for (const h of hits) console.error(`LEAK: ${h.what} in ${h.file.replace(root + "/", "")}`);
  process.exit(1);
}
console.log(`check:secrets: OK (${files.length} client-facing files scanned, key value ${key ? "checked" : "not available"}).`);
