/**
 * "Eyes" for Bro: turns a photo into an exact transcription + description.
 * Uses Groq's vision-capable model (free tier) when GROQ_API_KEY is set,
 * otherwise Claude when ANTHROPIC_API_KEY is set.
 */
import Anthropic from "@anthropic-ai/sdk";

class VisionUnavailable extends Error {}

const VISION_PROMPT = `You are the eyes of an assistant helping a college student. Read this image with maximum accuracy. Your output is the ONLY information the assistant will have about the image, so it must be complete and faithful.

Write in this exact structure:

TEXT IN IMAGE:
Transcribe ALL visible text exactly as written (same words, numbers, spelling, language). Keep structure: headings, question numbers, multiple-choice letters, bullet points, and tables (as Markdown tables). Include handwriting. If a word is unreadable, write [unclear]. Never guess or fix answers. If there is no text, write "(none)".

WHAT THE IMAGE SHOWS:
Describe the content precisely: what kind of image it is (worksheet, screenshot, diagram, chart, photo of people/objects/place, receipt, etc.), layout, every diagram/chart with its labels and values, objects, colors, setting, and any marks like checkmarks, circles, highlights, or scores. For people, describe appearance, clothing, expressions, and actions (never guess identities or names).

Do not answer questions in the image, solve problems, or add opinions. Only report what is there.
You may receive the image split into several tiles or crops internally. It is still ONE single image: describe it as one picture and never mention tiles, crops, grids of views, or zoomed sections unless the image itself is literally a collage.`;

export function visionAvailable(): boolean {
  return Boolean(process.env.GROQ_API_KEY || process.env.ANTHROPIC_API_KEY);
}

async function viaGroq(dataUrl: string): Promise<string> {
  const model = process.env.VISION_MODEL || "qwen/qwen3.8-27b";
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        max_tokens: 3000,
        temperature: 0.1,
        ...(/qwen/i.test(model) ? { reasoning_format: "hidden" } : {}),
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: VISION_PROMPT },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
    });
    if (res.ok) {
      const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = j.choices?.[0]?.message?.content?.trim();
      if (text) return text;
      throw new Error("empty vision response");
    }
    const detail = await res.text();
    if (res.status === 429 && attempt < 2) {
      const wait = Number(/try again in ([\d.]+)s/i.exec(detail)?.[1] ?? "8");
      if (wait <= 20) {
        await new Promise((r) => setTimeout(r, wait * 1000 + 300));
        continue;
      }
    }
    console.error(`[vision] ${model} HTTP ${res.status}:`, detail.slice(0, 300));
    throw new Error(`vision HTTP ${res.status}`);
  }
  throw new Error("vision rate limited");
}

async function viaClaude(dataUrl: string): Promise<string> {
  const client = new Anthropic();
  const data = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const res = await client.messages.create({
    model: process.env.VISION_MODEL || "claude-opus-5-5",
    max_tokens: 4000,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data } },
          { type: "text", text: VISION_PROMPT },
        ],
      },
    ],
  });
  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  if (!text) throw new Error("empty vision response");
  return text;
}

/** Returns a faithful transcription + description of the image. */
export async function describeImage(dataUrl: string): Promise<string> {
  if (process.env.GROQ_API_KEY) return viaGroq(dataUrl);
  if (process.env.ANTHROPIC_API_KEY) return viaClaude(dataUrl);
  throw new VisionUnavailable("Photo reading needs GROQ_API_KEY (free) or ANTHROPIC_API_KEY.");
}
