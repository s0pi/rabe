/**
 * Google Gemini provider (free tier friendly) with Google Search grounding.
 * Get a free key at https://aistudio.google.com/apikey and set GEMINI_API_KEY.
 *
 * Tries GEMINI_MODEL first; if that model is out of free quota (429) or
 * unavailable, falls back through GEMINI_FALLBACK_MODELS before giving up.
 */
import type { Source } from "@/lib/types";
import type { AIConfig } from "@/lib/ai/config";
import { personaPrompt, runtimeContext } from "@/lib/ai/persona";
import {
  UserFacingError,
  type GenerateCallbacks,
  type GenerateInput,
  type GenerateResult,
} from "./types";

const API = (process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta").replace(/\/+$/, "") + "/models";

interface GeminiChunk {
  candidates?: {
    content?: { parts?: { text?: string; thought?: boolean }[] };
    finishReason?: string;
    groundingMetadata?: {
      webSearchQueries?: string[];
      groundingChunks?: { web?: { uri?: string; title?: string } }[];
    };
  }[];
  promptFeedback?: { blockReason?: string };
  error?: { code?: number; message?: string; status?: string };
}

class RetryableModelError extends Error {}

/** Models that recently hit quota / were unavailable → skipped until this time. */
const cooldownUntil = new Map<string, number>();
const COOLDOWN_MS = 10 * 60 * 1000;

export async function generateWithGemini(
  cfg: AIConfig,
  input: GenerateInput,
  cb: GenerateCallbacks,
): Promise<GenerateResult> {
  if (!cfg.apiKey) throw new UserFacingError("GEMINI_API_KEY is not set on the server.", 500);

  const all = [cfg.model, ...(cfg.fallbackModels ?? [])].filter((m, i, a) => m && a.indexOf(m) === i);
  const now = Date.now();
  // Smartest model first; skip ones cooling down (but always keep the last resort).
  const models = all.filter((m, i) => i === all.length - 1 || (cooldownUntil.get(m) ?? 0) <= now);
  let lastError: unknown;

  for (const model of models) {
    try {
      const result = await runModel(model, cfg, input, cb);
      cooldownUntil.delete(model);
      return result;
    } catch (err) {
      if (input.signal.aborted) return { text: "", sources: [] };
      if (err instanceof RetryableModelError) {
        console.warn(`[gemini] ${model} unavailable (${err.message}), trying next model`);
        cooldownUntil.set(model, Date.now() + COOLDOWN_MS);
        lastError = err;
        continue;
      }
      throw err;
    }
  }

  console.error("[gemini] all models failed:", lastError);
  throw new UserFacingError(
    "Bro used up today's free AI quota (or Google is busy). Try again in a minute, or tomorrow if it keeps happening.",
    429,
  );
}

async function runModel(
  model: string,
  cfg: AIConfig,
  input: GenerateInput,
  cb: GenerateCallbacks,
): Promise<GenerateResult> {
  cb.onStatus("thinking");

  // Gemini wants alternating user/model turns, starting with user.
  const contents: { role: "user" | "model"; parts: { text: string }[] }[] = [];
  for (const m of input.messages) {
    const role = m.role === "assistant" ? "model" : "user";
    const last = contents[contents.length - 1];
    if (last && last.role === role) last.parts[0].text += `\n\n${m.content}`;
    else contents.push({ role, parts: [{ text: m.content }] });
  }
  while (contents.length && contents[0].role !== "user") contents.shift();

  const body = {
    systemInstruction: {
      parts: [{ text: [personaPrompt(cfg.webSearch), runtimeContext(), input.context].filter(Boolean).join("\n\n") }],
    },
    contents,
    ...(cfg.webSearch ? { tools: [{ google_search: {} }] } : {}),
    generationConfig: { maxOutputTokens: cfg.maxTokens, temperature: 0.9 },
  };

  let res: Response;
  try {
    res = await fetch(`${API}/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
      method: "POST",
      signal: input.signal,
      headers: { "Content-Type": "application/json", "x-goog-api-key": cfg.apiKey! },
      body: JSON.stringify(body),
    });
  } catch (err) {
    if (input.signal.aborted) throw err;
    console.error("[gemini] connection error:", err);
    throw new UserFacingError("Couldn't reach Google's AI service. Check your internet connection.", 503);
  }

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    console.error(`[gemini] ${model} HTTP ${res.status}:`, detail.slice(0, 400));
    if ((res.status === 400 || res.status === 401) && /API_KEY_INVALID|API key not valid/i.test(detail)) {
      throw new UserFacingError("The Gemini API key is invalid. Check GEMINI_API_KEY in .env.local.", 401);
    }
    if (res.status === 403 && /free tier is not available|set up billing|FREE_TIER_VERIFICATION/i.test(detail)) {
      throw new UserFacingError(
        "Google says this Gemini key's project isn't eligible for the free tier. Use a key from a different Google account, or switch to Groq (see README).",
        403,
      );
    }
    // Quota used up, model busy, not on the free tier, or not found → try the next model.
    if ([429, 500, 503, 404, 403].includes(res.status) || (res.status === 400 && /model|not supported|free tier/i.test(detail))) {
      throw new RetryableModelError(`HTTP ${res.status}`);
    }
    if (res.status === 403) {
      throw new UserFacingError("This Gemini API key isn't allowed to use the model. Check the key in Google AI Studio.", 403);
    }
    throw new UserFacingError("Google's AI couldn't process that request. Try rephrasing or starting a new chat.", 400);
  }

  let text = "";
  let blocked = false;
  const sources = new Map<string, Source>();
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let announcedSearch = false;

  const handle = (chunk: GeminiChunk) => {
    if (chunk.promptFeedback?.blockReason) blocked = true;
    const cand = chunk.candidates?.[0];
    if (!cand) return;

    const gm = cand.groundingMetadata;
    if (gm?.webSearchQueries?.length && !announcedSearch && !text) {
      announcedSearch = true;
      cb.onStatus("searching", gm.webSearchQueries[0]);
    }
    if (gm?.groundingChunks?.length) {
      let changed = false;
      for (const g of gm.groundingChunks) {
        const uri = g.web?.uri;
        if (uri && !sources.has(uri)) {
          sources.set(uri, { url: uri, title: g.web?.title || "Source" });
          changed = true;
        }
      }
      if (changed) cb.onSources([...sources.values()].slice(0, 8));
    }

    for (const part of cand.content?.parts ?? []) {
      if (part.thought || !part.text) continue;
      if (!text) cb.onStatus("writing");
      text += part.text;
      cb.onText(part.text);
    }
    if (cand.finishReason && ["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII"].includes(cand.finishReason)) {
      blocked = true;
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const raw of lines) {
        const line = raw.trim();
        if (!line.startsWith("data:")) continue;
        try {
          const chunk = JSON.parse(line.slice(5).trim()) as GeminiChunk;
          if (chunk.error) {
            if (!text && chunk.error.code === 429) throw new RetryableModelError("quota (stream)");
            throw new UserFacingError("Google's AI stopped mid-reply. Please try again.", 502);
          }
          handle(chunk);
        } catch (err) {
          if (err instanceof RetryableModelError || err instanceof UserFacingError) throw err;
          // ignore malformed chunk
        }
      }
    }
  } catch (err) {
    if (input.signal.aborted) return { text, sources: [...sources.values()] };
    if (err instanceof RetryableModelError || err instanceof UserFacingError) throw err;
    console.error("[gemini] stream error:", err);
    throw new UserFacingError("The connection to the AI dropped mid-reply. Please try again.", 502);
  }

  if (!text.trim()) {
    const note = blocked
      ? "Ay, that one's off-limits for me, pre. Even handsome AIs have rules 😅 Try asking it a different way!"
      : "Hmm, my brain buffered and came back empty 😅 Try asking that again?";
    text = note;
    cb.onText(note);
  }

  return { text, sources: [...sources.values()].slice(0, 8) };
}
