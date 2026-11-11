import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { passcodeEnabled } from "@/lib/auth";

const OWNER_ID = "rabe";

const VISITOR_COOKIE = "rabe_vid";
const ONE_YEAR = 60 * 60 * 24 * 365;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Anonymous per-browser id (httpOnly cookie). Chat history is scoped to it,
 * so each visitor only ever sees their own conversations.
 */
export async function getVisitorId(): Promise<string> {
  // Passcode mode: there's exactly one user (Rabe), so every unlocked device
  // shares the same chat history.
  if (passcodeEnabled()) return OWNER_ID;

  const jar = await cookies();
  const existing = jar.get(VISITOR_COOKIE)?.value;
  if (existing && UUID_RE.test(existing)) return existing;

  const id = randomUUID();
  jar.set(VISITOR_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_YEAR,
  });
  return id;
}

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export function errorJson(message: string, status = 400) {
  return json({ error: message }, status);
}

/** Simple sliding-window limiter (per server instance). */
const hits = new Map<string, number[]>();
export function rateLimited(key: string): boolean {
  const limit = Number.parseInt(process.env.RATE_LIMIT_PER_5_MIN ?? "30", 10) || 30;
  const windowMs = 5 * 60 * 1000;
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
  }
  return false;
}

/** Turn a first message into a tidy conversation title. */
export function makeTitle(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim().replace(/^[#>*\-\s]+/, "");
  if (clean.length <= 48) return clean || "New chat";
  const cut = clean.slice(0, 48);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 24 ? cut.slice(0, lastSpace) : cut).replace(/[,.;:!?-]+$/, "")}…`;
}

export const MAX_MESSAGE_CHARS = 8000;
export const HISTORY_LIMIT = 40;
