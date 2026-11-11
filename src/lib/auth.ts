/**
 * Single-user passcode lock.
 *
 * Set APP_PASSCODE to lock the whole app (chat, history, API, photos) behind
 * a passcode. Leave it empty to keep the app open (handy for local testing).
 * The session cookie holds an HMAC derived from the passcode, so changing the
 * passcode signs out every device.
 *
 * Uses Web Crypto only, so it works in both the proxy and route handlers.
 */

export const AUTH_COOKIE = "rabe_auth";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 90; // 90 days

export function passcodeEnabled(): boolean {
  return Boolean(process.env.APP_PASSCODE);
}

const encoder = new TextEncoder();

async function hmacHex(key: string, message: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", encoder.encode(key), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const sig = await crypto.subtle.sign("HMAC", k, encoder.encode(message));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  const x = encoder.encode(a);
  const y = encoder.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** The session token a correctly-unlocked browser holds. */
export async function sessionToken(): Promise<string> {
  const passcode = process.env.APP_PASSCODE ?? "";
  return hmacHex(`${passcode}:${process.env.AUTH_SECRET ?? ""}`, "bro-session-v1");
}

/** True if the app is open, or the token matches the current passcode. */
export async function isAuthorized(token: string | undefined): Promise<boolean> {
  if (!passcodeEnabled()) return true;
  if (!token) return false;
  return safeEqual(token, await sessionToken());
}

/** Checks a passcode attempt (constant time). */
export async function checkPasscode(attempt: string): Promise<boolean> {
  const passcode = process.env.APP_PASSCODE ?? "";
  if (!passcode) return true;
  // Compare HMACs so timing doesn't depend on where the strings differ.
  const [a, b] = await Promise.all([hmacHex("cmp", attempt), hmacHex("cmp", passcode)]);
  return safeEqual(a, b);
}
