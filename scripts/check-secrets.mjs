// Fails if a server secret (the AssemblyAI key, the Auth.js secret, the Google
// client secret or the database URL), or one of their variable names, appears
// anywhere in the client-side build output. Run after `next build`.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const clientDirs = [".next/static"].map((d) => join(root, d));
// Also scan prerendered HTML/RSC payloads that are served to browsers.
const serverAppDir = join(root, ".next/server/app");

const SECRET_VARS = ["ASSEMBLYAI_API_KEY", "AUTH_SECRET", "AUTH_GOOGLE_SECRET", "DATABASE_URL"];

function loadSecret(name) {
  if (process.env[name]) return process.env[name];
  for (const f of [".env.local", ".env"]) {
    const p = join(root, f);
    if (!existsSync(p)) continue;
    const m = readFileSync(p, "utf8").match(new RegExp(`^${name}=(.*)$`, "m"));
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

const values = new Map(SECRET_VARS.map((n) => [n, loadSecret(n)]).filter(([, v]) => v && v.length >= 8));
const needles = [...SECRET_VARS, ...values.values()];
const missing = SECRET_VARS.filter((n) => !values.has(n));
if (missing.length) console.warn(`check:secrets: no value for ${missing.join(", ")}; checking their variable names only.`);

const files = [
  ...clientDirs.flatMap((d) => [...walk(d)]),
  ...walk(serverAppDir, (p) => /\.(html|rsc|body|meta)$/.test(p)),
];

const hits = [];
for (const file of files) {
  const text = readFileSync(file, "utf8");
  for (const n of needles) {
    if (!text.includes(n)) continue;
    const owner = [...values].find(([, v]) => v === n)?.[0];
    hits.push({ file, what: owner ? `${owner} value` : n });
  }
}

if (hits.length) {
  for (const h of hits) console.error(`LEAK: ${h.what} in ${h.file.replace(root + "/", "")}`);
  process.exit(1);
}
console.log(`check:secrets: OK (${files.length} client-facing files scanned; values checked: ${[...values.keys()].join(", ") || "none"}).`);
