/**
 * Builds what the AI actually reads from attachments, within a size budget.
 *
 * Free AI tiers limit how much text fits in one request, so long files are
 * cut down smartly: the beginning plus the parts that best match Rabe's
 * question (including "page 3" / "slide 5" / "number 4" references).
 */
import type { Attachment, AttachmentKind } from "@/lib/types";

const LABEL: Record<AttachmentKind, string> = { image: "photo", pdf: "PDF", docx: "Word document", pptx: "PowerPoint" };

const STOP = new Set(
  (
    "the and for are but not you your with this that what which from have has had was were will would could should " +
    "about into than then them they their there here when where how why who whom can does did done just also only " +
    "please help me my mine our explain answer question questions file document pdf word slide slides page pages photo " +
    "image picture bro rabe ang mga nga ug sa ni si kay ako ikaw siya kami kita nila unsa ano paano pano naman lang " +
    "yung ung kung ba man gyud diay pud pod din rin dito diri karon ngayon"
  ).split(" "),
);

interface Chunk {
  label: string; // e.g. "Page 3"
  num?: number; // page/slide number
  text: string;
  index: number;
}

const CHUNK_SIZE = 1400;

function toChunks(text: string): Chunk[] {
  // Split on our page/slide markers first.
  const parts = text.split(/(?=^--- (?:Page|Slide) \d+ ---$)/m);
  const chunks: Chunk[] = [];
  for (const part of parts) {
    const head = /^--- (Page|Slide) (\d+) ---$/m.exec(part);
    const label = head ? `${head[1]} ${head[2]}` : "";
    const num = head ? Number(head[2]) : undefined;
    if (part.length <= CHUNK_SIZE) {
      chunks.push({ label, num, text: part, index: chunks.length });
      continue;
    }
    // Long section: split by paragraphs into ~CHUNK_SIZE pieces.
    let buf = "";
    for (const para of part.split(/\n{2,}/)) {
      if (buf && buf.length + para.length > CHUNK_SIZE) {
        chunks.push({ label, num, text: buf, index: chunks.length });
        buf = "";
      }
      buf += (buf ? "\n\n" : "") + para;
      while (buf.length > CHUNK_SIZE * 1.5) {
        chunks.push({ label, num, text: buf.slice(0, CHUNK_SIZE), index: chunks.length });
        buf = buf.slice(CHUNK_SIZE);
      }
    }
    if (buf.trim()) chunks.push({ label, num, text: buf, index: chunks.length });
  }
  return chunks;
}

function keywords(question: string): string[] {
  return [
    ...new Set(
      question
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 3 && !STOP.has(w)),
    ),
  ];
}

/** Numbers the question points at: "page 3", "slide 5", "number 4", "#7", "item 2", "q3". */
function referencedNumbers(question: string) {
  const q = question.toLowerCase();
  const pages = [...q.matchAll(/\b(?:page|pahina|slide|p\.)\s*(\d{1,3})/g)].map((m) => Number(m[1]));
  const items = [...q.matchAll(/(?:\bnumber|\bno\.?|#|\bitem|\bq|\bquestion)\s*(\d{1,3})\b/g)].map((m) => m[1]);
  return { pages, items };
}

function score(chunk: Chunk, kws: string[], refs: ReturnType<typeof referencedNumbers>): number {
  const t = chunk.text.toLowerCase();
  let s = 0;
  for (const k of kws) {
    let count = 0;
    let i = t.indexOf(k);
    while (i !== -1 && count < 4) {
      count++;
      i = t.indexOf(k, i + k.length);
    }
    s += count;
  }
  if (chunk.num !== undefined && refs.pages.includes(chunk.num)) s += 50;
  for (const n of refs.items) {
    if (new RegExp(`(^|\\n)\\s*(?:${n}[.)]|${n}\\s|q${n}\\b|question\\s*${n}\\b)`, "i").test(chunk.text)) s += 25;
  }
  return s;
}

/** Fits one attachment's text into `budget` characters, focused on the question. */
export function focusText(text: string, question: string, budget: number): { text: string; partial: boolean } {
  if (text.length <= budget) return { text, partial: false };
  const chunks = toChunks(text);
  const kws = keywords(question);
  const refs = referencedNumbers(question);

  const chosen = new Set<number>([0]); // always keep the beginning
  let used = chunks[0]?.text.length ?? 0;
  const ranked = chunks
    .slice(1)
    .map((c) => ({ c, s: score(c, kws, refs) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.c.index - b.c.index);
  for (const { c } of ranked) {
    if (used + c.text.length > budget) continue;
    chosen.add(c.index);
    used += c.text.length;
  }
  // Fill any remaining room in reading order (useful for "summarize this").
  for (const c of chunks) {
    if (chosen.has(c.index)) continue;
    if (used + c.text.length > budget) break;
    chosen.add(c.index);
    used += c.text.length;
  }

  const out: string[] = [];
  let last = -1;
  for (const c of chunks) {
    if (!chosen.has(c.index)) continue;
    if (c.index !== last + 1) out.push("[… some parts skipped …]");
    out.push(c.text);
    last = c.index;
  }
  if (last !== chunks.length - 1) out.push("[… rest of the file skipped …]");
  return { text: out.join("\n\n"), partial: true };
}

/** Formats attachments as a block the AI reads inside the user's message. */
export function formatAttachments(attachments: Attachment[], question: string, budget: number, heading?: string): string {
  if (!attachments.length) return "";
  const per = Math.max(1500, Math.floor(budget / attachments.length));
  const blocks = attachments.map((a, i) => {
    const { text, partial } = focusText(a.text, question, per);
    const count = a.pages ? `, ${a.pages} ${a.kind === "pptx" ? "slides" : "pages"}` : "";
    const notes = [a.note, partial ? "Long file: only the beginning and the parts most related to the question are shown." : ""]
      .filter(Boolean)
      .join(" ");
    return `[Attachment ${i + 1}: ${LABEL[a.kind]} "${a.name}"${count}]${notes ? `\n(Note: ${notes})` : ""}\n<<<\n${text}\n>>>`;
  });
  return `${heading ?? "Rabe attached these files:"}\n\n${blocks.join("\n\n")}`;
}

/** A one-line mention of older attachments (keeps history small). */
export function mentionAttachments(attachments: Attachment[]): string {
  return attachments.length
    ? `[Rabe attached: ${attachments.map((a) => `${LABEL[a.kind]} "${a.name}"`).join(", ")}]`
    : "";
}
