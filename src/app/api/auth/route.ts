import { cookies, headers } from "next/headers";
import { AUTH_COOKIE, SESSION_MAX_AGE, checkPasscode, passcodeEnabled, sessionToken } from "@/lib/auth";
import { errorJson, json } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Brute-force protection: limited wrong attempts per IP. */
const attempts = new Map<string, number[]>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILS = 8;
const globalFails: number[] = [];
const MAX_GLOBAL_FAILS = 40;

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

/** Unlock: check the passcode and set the session cookie. */
export async function POST(req: Request) {
  if (!passcodeEnabled()) return json({ ok: true });

  const ip = await clientIp();
  const now = Date.now();
  const recent = (attempts.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  // Backstop across all IPs, in case someone rotates IPs or forges headers.
  globalFails.splice(0, globalFails.length, ...globalFails.filter((t) => now - t < WINDOW_MS));
  if (globalFails.length >= MAX_GLOBAL_FAILS) {
    return errorJson("Too many wrong tries recently. Try again in a few minutes.", 429);
  }
  if (recent.length >= MAX_FAILS) {
    const waitMin = Math.ceil((WINDOW_MS - (now - recent[0])) / 60000);
    return errorJson(`Too many wrong tries. Bro needs a break. Try again in ${waitMin} min.`, 429);
  }

  let passcode = "";
  try {
    const body = (await req.json()) as { passcode?: unknown };
    passcode = typeof body.passcode === "string" ? body.passcode.trim() : "";
  } catch {
    return errorJson("Invalid request.");
  }
  if (!passcode) return errorJson("Enter your passcode.");

  if (!(await checkPasscode(passcode))) {
    globalFails.push(now);
    recent.push(now);
    attempts.set(ip, recent);
    const left = MAX_FAILS - recent.length;
    return errorJson(
      left > 0 ? `That's not it. Bro only talks to Rabe. (${left} ${left === 1 ? "try" : "tries"} left)` : "Too many wrong tries. Try again later.",
      401,
    );
  }

  attempts.delete(ip);
  (await cookies()).set(AUTH_COOKIE, await sessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return json({ ok: true });
}

/** Lock: clear the session cookie on this device. */
export async function DELETE() {
  (await cookies()).delete(AUTH_COOKIE);
  return json({ ok: true });
}
