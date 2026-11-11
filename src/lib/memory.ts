/**
 * Bro's long-term memory about Rabe.
 *
 * After each message, a small, fast model reads what Rabe said (plus Bro's
 * previous message for context) and returns which facts to save, correct, or
 * forget. Facts are stored in the database and given to Bro on every request.
 * Date math (birthday countdowns, age) is computed here, never by the AI.
 */
import type { Memory, MemoryChange } from "@/lib/types";

const TZ = "Asia/Manila";
const MONTHS: Record<string, number> = {};
[
  ["january", "jan", "enero"],
  ["february", "feb", "pebrero", "febrero"],
  ["march", "mar", "marso", "marzo"],
  ["april", "apr", "abril"],
  ["may", "mayo"],
  ["june", "jun", "hunyo", "junio"],
  ["july", "jul", "hulyo", "julio"],
  ["august", "aug", "agosto"],
  ["september", "sep", "sept", "setyembre", "septiembre"],
  ["october", "oct", "oktubre", "octubre"],
  ["november", "nov", "nobyembre", "noviembre"],
  ["december", "dec", "disyembre", "diciembre"],
].forEach((names, i) => names.forEach((n) => (MONTHS[n] = i + 1)));
const MONTH_NAME = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Today's date in the Philippines. */
export function todayPH(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(now)
    .reduce<Record<string, string>>((acc, p) => ((acc[p.type] = p.value), acc), {});
  return { y: Number(parts.year), m: Number(parts.month), d: Number(parts.day) };
}

/** Parses "2004-03-05", "03-05", "March 5", "5 March 2004", "Marso 5, 2004". */
export function parseDate(value: string): { y?: number; m: number; d: number } | null {
  const v = value.trim().toLowerCase();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(v);
  if (m) return valid({ y: +m[1], m: +m[2], d: +m[3] });
  m = /^(\d{1,2})-(\d{1,2})$/.exec(v);
  if (m) return valid({ m: +m[1], d: +m[2] });
  const words = v.replace(/[,.]/g, " ").split(/\s+/).filter(Boolean);
  const monthIdx = words.findIndex((w) => MONTHS[w]);
  if (monthIdx === -1) return null;
  const nums = words.filter((w) => /^\d+(st|nd|rd|th)?$/.test(w)).map((w) => parseInt(w, 10));
  const day = nums.find((n) => n >= 1 && n <= 31);
  const year = nums.find((n) => n >= 1900 && n <= 2100);
  return day ? valid({ y: year, m: MONTHS[words[monthIdx]], d: day }) : null;
}

function valid(x: { y?: number; m: number; d: number }) {
  if (x.m < 1 || x.m > 12 || x.d < 1 || x.d > 31) return null;
  return x;
}

const utc = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d);
const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** Exact countdown text for a birthday value. */
export function birthdayInfo(value: string, now = new Date()): string | null {
  const b = parseDate(value);
  if (!b) return null;
  const t = todayPH(now);
  const dayIn = (y: number) => (b.m === 2 && b.d === 29 && !isLeap(y) ? 28 : b.d);
  let year = t.y;
  if (utc(year, b.m, dayIn(year)) < utc(t.y, t.m, t.d)) year++;
  const days = Math.round((utc(year, b.m, dayIn(year)) - utc(t.y, t.m, t.d)) / 86_400_000);
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(new Date(utc(year, b.m, dayIn(year))));
  const when = `${weekday}, ${MONTH_NAME[b.m - 1]} ${dayIn(year)}, ${year}`;
  const turning = b.y ? year - b.y : undefined;
  const ageNow = b.y ? (days === 0 ? year - b.y : year - b.y - 1) : undefined;

  const head = `${MONTH_NAME[b.m - 1]} ${b.d}${b.y ? `, ${b.y}` : " (birth year unknown)"}`;
  if (days === 0) return `${head}. 🎂 TODAY is his birthday!${turning ? ` He turns ${turning} today.` : ""}`;
  return `${head}. Next birthday: ${when}, in exactly ${days} day${days === 1 ? "" : "s"}.${
    turning ? ` He'll turn ${turning}. His age right now: ${ageNow}.` : ""
  }`;
}

/** The memory block added to Bro's context on every request. */
export function memoryContext(memories: Memory[], now = new Date()): string {
  if (!memories.length) {
    return "<memory>\nNothing saved yet. When it fits, ask Rabe about himself (e.g. his birthday); what he shares is remembered automatically.\n</memory>";
  }
  const lines = memories.slice(0, 60).map((m) => {
    const isDateKey = /birthday|bday|birth_date|date_of_birth/.test(m.key);
    const extra = isDateKey ? birthdayInfo(m.value, now) : null;
    return `- ${m.key}: ${extra ?? m.value}`;
  });
  return `<memory>
What you remember about Rabe from your chats. This is newer than his base profile, so trust it when they differ. Date countdowns below are computed exactly; use those numbers as given.
${lines.join("\n")}
</memory>`;
}

/* ── Extraction ─────────────────────────────────────────────────── */

const EXTRACT_PROMPT = `You update the long-term memory of "Bro", an AI best friend, about its only user, Rabe (Mark Argie P. Rabe). Read Rabe's newest message (Bro's previous message is only context) and output JSON describing what to save.

Output exactly: {"set": {"key": "value"}, "delete": ["key"]}

Save facts Rabe states about himself and his life: birthday, age, favorites (food, color, games, songs, shows), people in his life (family, friends, crush or partner, with names and relation), school details (subjects, schedule, teachers, grades, exams, deadlines), goals and plans, important dates and events, likes and dislikes, habits, and how he wants Bro to talk to him.

Rules:
- Only what Rabe clearly says is true about himself. Ignore questions, hypotheticals, obvious jokes, lyrics, and general topics. Never save what Bro said.
- A short answer to Bro's question counts (Bro asked his birthday, Rabe replies "March 5" → save birthday).
- Keys: short English snake_case (birthday, favorite_food, crush, sister_name, exam_date). Reuse an existing key when updating or correcting it; never create a duplicate key for the same fact.
- Corrections win: if he says earlier info was wrong or changed, overwrite that key with the new value.
- If he says something is no longer true, or asks Bro to forget it, put the key in "delete".
- birthday value: "YYYY-MM-DD" if he gave the year, otherwise "MM-DD". Other dates: "YYYY-MM-DD" when the year is known.
- Values: short and specific, in English, keeping names and local words as he wrote them.
- If there's nothing to save: {"set": {}, "delete": []}`;

export function normalizeKey(key: string): string {
  return key
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

interface ExtractInput {
  userMessage: string;
  previousAssistant?: string;
  memories: Memory[];
}

type JsonCaller = (system: string, user: string) => Promise<unknown | null>;

/** Asks a small model which memory facts to set/delete. Returns validated changes. */
export async function extractMemoryChanges(input: ExtractInput, callJson: JsonCaller): Promise<MemoryChange[]> {
  const msg = input.userMessage.trim();
  if (msg.length < 2) return [];
  const current = Object.fromEntries(input.memories.map((m) => [m.key, m.value]));
  const t = todayPH();
  const user = [
    `Current memory: ${JSON.stringify(current)}`,
    `Today's date: ${t.y}-${String(t.m).padStart(2, "0")}-${String(t.d).padStart(2, "0")}`,
    input.previousAssistant ? `Bro's previous message: ${JSON.stringify(input.previousAssistant.slice(0, 700))}` : "",
    `Rabe's newest message: ${JSON.stringify(msg.slice(0, 2000))}`,
  ]
    .filter(Boolean)
    .join("\n");

  const out = (await callJson(EXTRACT_PROMPT, user)) as { set?: Record<string, unknown>; delete?: unknown } | null;
  if (!out || typeof out !== "object") return [];

  const changes: MemoryChange[] = [];
  for (const [rawKey, rawVal] of Object.entries(out.set ?? {})) {
    const key = normalizeKey(rawKey);
    const value = typeof rawVal === "string" ? rawVal.trim().slice(0, 300) : typeof rawVal === "number" ? String(rawVal) : "";
    if (!key || !value || current[key] === value) continue;
    changes.push({ key, value, previous: current[key] ?? null });
  }
  for (const rawKey of Array.isArray(out.delete) ? out.delete : []) {
    const key = typeof rawKey === "string" ? normalizeKey(rawKey) : "";
    if (key && key in current && !changes.some((c) => c.key === key)) {
      changes.push({ key, value: null, previous: current[key] });
    }
  }
  return changes.slice(0, 15);
}
