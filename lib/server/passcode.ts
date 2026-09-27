// Demo passcode gate (brief §15): an HMAC-signed, expiring cookie. Web Crypto
// only, so it runs in the proxy and in route handlers without dependencies.

export const PASS_COOKIE = "bm_pass";
export const PASS_TTL_MS = 12 * 60 * 60 * 1000;

const enc = new TextEncoder();

function b64url(bytes: ArrayBuffer): string {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(`benchmate-pass:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < Math.max(ab.length, bb.length); i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

export async function signPass(secret: string, now: number = Date.now()): Promise<string> {
  const payload = `v1.${now + PASS_TTL_MS}`;
  return `${payload}.${await hmac(secret, payload)}`;
}

export async function verifyPass(secret: string, token: string | undefined, now: number = Date.now()): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return false;
  const expiry = Number(parts[1]);
  if (!Number.isFinite(expiry) || expiry < now) return false;
  return safeEqual(parts[2]!, await hmac(secret, `${parts[0]}.${parts[1]}`));
}
