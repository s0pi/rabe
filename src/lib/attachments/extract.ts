/**
 * Reads files Rabe attaches and turns them into text Bro can work with.
 *
 *  - Photos (JPG/PNG/WEBP/GIF): read by a vision model → full text transcription + description
 *  - PDF:  text per page (unpdf / PDF.js)
 *  - Word (.docx): document text (mammoth)
 *  - PowerPoint (.pptx): text per slide + speaker notes (unzipped XML)
 *
 * File types are checked by their actual bytes, not just the extension.
 */
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import type { Attachment, AttachmentKind } from "@/lib/types";
import { describeImage } from "./vision";

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // stays under serverless body limits
/** Max text stored per attachment (later trimmed per request to fit the AI's limits). */
const MAX_STORED_CHARS = 120_000;
const MAX_PDF_PAGES = 150;

export class AttachmentError extends Error {}

const ZIP = [0x50, 0x4b, 0x03, 0x04];
const startsWith = (b: Buffer, sig: number[], offset = 0) => sig.every((v, i) => b[offset + i] === v);

/** Detects the real file type from its bytes. */
export async function detectKind(buf: Buffer): Promise<{ kind: AttachmentKind; mime: string } | null> {
  if (startsWith(buf, [0x25, 0x50, 0x44, 0x46])) return { kind: "pdf", mime: "application/pdf" }; // %PDF
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return { kind: "image", mime: "image/jpeg" };
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47])) return { kind: "image", mime: "image/png" };
  if (startsWith(buf, [0x47, 0x49, 0x46, 0x38])) return { kind: "image", mime: "image/gif" };
  if (startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && buf.toString("ascii", 8, 12) === "WEBP") {
    return { kind: "image", mime: "image/webp" };
  }
  if (startsWith(buf, ZIP)) {
    const JSZip = (await import("jszip")).default;
    try {
      const zip = await JSZip.loadAsync(buf);
      if (zip.file("word/document.xml")) return { kind: "docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
      if (zip.file("ppt/presentation.xml")) return { kind: "pptx", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation" };
    } catch {
      return null;
    }
  }
  return null;
}

const clean = (s: string) =>
  s
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

function cap(text: string): { text: string; truncated: boolean } {
  return text.length > MAX_STORED_CHARS
    ? { text: text.slice(0, MAX_STORED_CHARS), truncated: true }
    : { text, truncated: false };
}

async function readPdf(buf: Buffer) {
  const { getDocumentProxy, extractText } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  const pages = text.slice(0, MAX_PDF_PAGES);
  const body = pages.map((t, i) => `--- Page ${i + 1} ---\n${clean(t) || "(no selectable text on this page)"}`).join("\n\n");
  const textChars = pages.join("").replace(/\s/g, "").length;
  const notes: string[] = [];
  if (totalPages > MAX_PDF_PAGES) notes.push(`Only the first ${MAX_PDF_PAGES} of ${totalPages} pages were read.`);
  if (textChars < 40 * Math.max(1, pages.length)) {
    notes.push("This PDF looks scanned (little selectable text). For best results, send the pages as photos.");
  }
  return { text: body, pages: totalPages, note: notes.join(" ") || undefined };
}

const decodeHtml = (s: string) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&")
    .trim();

/** Word HTML → readable text: headings, numbered/bulleted lists, and tables as Markdown rows. */
function wordHtmlToText(html: string): string {
  let out = html;
  // Tables → Markdown table rows.
  out = out.replace(/<table[\s\S]*?<\/table>/g, (table) => {
    const rows = [...table.matchAll(/<tr[\s\S]*?<\/tr>/g)].map((r) =>
      [...r[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) => decodeHtml(c[1].replace(/<\/p>\s*<p>/g, " ")).replace(/\|/g, "/")),
    );
    if (!rows.length) return "\n";
    const width = Math.max(...rows.map((r) => r.length));
    const line = (r: string[]) => `| ${[...r, ...Array(width - r.length).fill("")].join(" | ")} |`;
    return `\n\n${line(rows[0])}\n|${" --- |".repeat(width)}\n${rows.slice(1).map(line).join("\n")}\n\n`;
  });
  // Ordered lists keep their numbers.
  out = out.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/g, (_, inner: string) => {
    let n = 0;
    return `\n${inner.replace(/<li[^>]*>([\s\S]*?)<\/li>/g, (_m: string, li: string) => `\n${++n}. ${decodeHtml(li)}`)}\n`;
  });
  out = out
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/g, (_, li: string) => `\n• ${decodeHtml(li)}`)
    .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/g, (_, l: string, h: string) => `\n\n${"#".repeat(Number(l))} ${decodeHtml(h)}\n\n`)
    .replace(/<br\s*\/?>/g, "\n")
    .replace(/<\/p>/g, "\n\n");
  return clean(decodeHtml(out));
}

async function readDocx(buf: Buffer) {
  const mammoth = await import("mammoth");
  let text = "";
  try {
    const { value } = await mammoth.convertToHtml({ buffer: buf });
    text = wordHtmlToText(value);
  } catch {
    // fall back to plain text
  }
  if (!text) text = clean((await mammoth.extractRawText({ buffer: buf })).value);
  if (!text) throw new AttachmentError("This Word file has no readable text.");
  return { text };
}

const decodeXml = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");

/** Text of a slide/notes XML, one line per paragraph. */
function xmlParagraphs(xml: string): string[] {
  const paras = xml.split(/<a:p[\s>]/).slice(1);
  return paras
    .map((p) => [...p.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)].map((m) => decodeXml(m[1])).join(""))
    .map((t) => t.trim())
    .filter(Boolean);
}

async function readPptx(buf: Buffer) {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buf);
  const slideFiles = Object.keys(zip.files)
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort((a, b) => Number(a.match(/(\d+)\.xml$/)![1]) - Number(b.match(/(\d+)\.xml$/)![1]));

  // Use the presentation's real slide order when available.
  const order: string[] = [];
  try {
    const pres = await zip.file("ppt/presentation.xml")!.async("string");
    const rels = await zip.file("ppt/_rels/presentation.xml.rels")!.async("string");
    const target = new Map([...rels.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map((m) => [m[1], m[2]]));
    for (const m of pres.matchAll(/<p:sldId [^>]*r:id="([^"]+)"/g)) {
      const t = target.get(m[1]);
      if (t) order.push(`ppt/${t.replace(/^\.\.\//, "").replace(/^\//, "")}`);
    }
  } catch {
    // fall back to file-name order
  }
  const slides = order.length ? order.filter((f) => zip.file(f)) : slideFiles;

  const parts: string[] = [];
  for (const [i, file] of slides.entries()) {
    const xml = await zip.file(file)!.async("string");
    const lines = xmlParagraphs(xml);
    let notes: string[] = [];
    const relFile = file.replace("ppt/slides/", "ppt/slides/_rels/") + ".rels";
    const rel = await zip.file(relFile)?.async("string");
    const notesTarget = rel?.match(/Target="\.\.\/notesSlides\/(notesSlide\d+\.xml)"/)?.[1];
    if (notesTarget) {
      const nx = await zip.file(`ppt/notesSlides/${notesTarget}`)?.async("string");
      if (nx) notes = xmlParagraphs(nx).filter((l) => !/^\d+$/.test(l)); // drop slide-number placeholders
    }
    parts.push(
      `--- Slide ${i + 1} ---\n${lines.join("\n") || "(no text on this slide)"}${notes.length ? `\n[Speaker notes] ${notes.join(" ")}` : ""}`,
    );
  }
  if (!parts.length) throw new AttachmentError("This PowerPoint has no slides.");
  return { text: parts.join("\n\n"), pages: slides.length };
}

async function readImage(buf: Buffer, mime: string) {
  // Normalize: fix rotation, strip metadata (GPS), cap size for the vision model.
  const base = sharp(buf, { animated: false }).rotate();
  const normalized = await base
    .clone()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 88 })
    .toBuffer();
  const thumb = await base
    .clone()
    .resize({ width: 320, height: 320, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 70 })
    .toBuffer();
  const meta = await sharp(normalized).metadata();
  void mime;
  const text = await describeImage(`data:image/jpeg;base64,${normalized.toString("base64")}`);
  return {
    text: `(Image ${meta.width}×${meta.height}, read by an image model.)\n${text}`,
    preview: `data:image/webp;base64,${thumb.toString("base64")}`,
  };
}

const KIND_LABEL: Record<AttachmentKind, string> = { image: "photo", pdf: "PDF", docx: "Word file", pptx: "PowerPoint" };

/** Reads one uploaded file into an Attachment (with the text Bro will read). */
export async function readAttachment(name: string, buf: Buffer): Promise<Attachment> {
  if (buf.length === 0) throw new AttachmentError("That file is empty.");
  if (buf.length > MAX_UPLOAD_BYTES) throw new AttachmentError("That file is too big (max 4 MB).");

  const type = await detectKind(buf);
  if (!type) {
    throw new AttachmentError("Bro can read photos (JPG, PNG, WEBP), PDF, Word (.docx) and PowerPoint (.pptx) files only.");
  }

  let result: { text: string; pages?: number; note?: string; preview?: string };
  try {
    if (type.kind === "pdf") result = await readPdf(buf);
    else if (type.kind === "docx") result = await readDocx(buf);
    else if (type.kind === "pptx") result = await readPptx(buf);
    else result = await readImage(buf, type.mime);
  } catch (err) {
    if (err instanceof AttachmentError) throw err;
    console.error(`[attachments] failed to read ${type.kind}:`, err);
    throw new AttachmentError(`Bro couldn't read that ${KIND_LABEL[type.kind]}. It might be damaged or password-protected.`);
  }

  const { text, truncated } = cap(result.text);
  const note = [result.note, truncated ? "It's very long, so only the first part was kept." : ""].filter(Boolean).join(" ");
  return {
    id: randomUUID(),
    name: name.slice(0, 120) || `${KIND_LABEL[type.kind]}`,
    kind: type.kind,
    size: buf.length,
    ...(result.pages ? { pages: result.pages } : {}),
    ...(result.preview ? { preview: result.preview } : {}),
    ...(note ? { note } : {}),
    text,
  };
}
