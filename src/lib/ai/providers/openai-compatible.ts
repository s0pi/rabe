/**
 * OpenAI-compatible chat provider: Groq (free tier, default) or any other
 * OpenAI-style API (OpenAI, OpenRouter, Together, local Ollama, …).
 *
 * Groq extras:
 *  - GPT-OSS models get Groq's built-in `browser_search` tool (free web search).
 *  - Model fallback: if a model is rate-limited (free tier), the next one in
 *    the chain answers, and the limited model is skipped for a few minutes.
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

/** A model can't answer right now; another model (or a short wait) may work. */
class RetryableModelError extends Error {
  constructor(
    message: string,
    /** How long until this model is likely available again. */
    public retryAfterMs = 60_000,
  ) {
    super(message);
  }
}

const cooldownUntil = new Map<string, number>();
/** Wait at most this long for a free-tier rate limit to reset before giving up. */
const MAX_WAIT_MS = 25_000;
/** If the smartest model is busy for at most this long, wait for it instead of falling back. */
const PREFER_SMART_WAIT_MS = 10_000;
/** Reads "Please try again in 4.2s" / "in 1m3.5s" or a Retry-After header. */
function parseRetryAfter(detail: string, header: string | null): number {
  const m = /try again in (?:(\d+)h)?(?:(\d+)m(?!s))?(?:([\d.]+)s)?/i.exec(detail);
  if (m && (m[1] || m[2] || m[3])) {
    return ((+(m[1] ?? 0) * 60 + +(m[2] ?? 0)) * 60 + +(m[3] ?? 0)) * 1000;
  }
  const h = Number(header);
  return Number.isFinite(h) && h > 0 ? h * 1000 : 60_000;
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(t);
      resolve();
    });
  });

interface ExecutedTool {
  name?: string;
  index?: number;
  type?: string;
  arguments?: string;
  output?: string;
  search_results?: { results?: { title?: string; url?: string }[] | null };
}

interface StreamChunk {
  choices?: { delta?: { content?: string | null; executed_tools?: ExecutedTool[] }; finish_reason?: string | null }[];
  error?: { message?: string; type?: string; code?: string };
  x_groq?: { error?: { message?: string } };
}

const isGroq = (cfg: AIConfig) => cfg.provider === "groq" || /api\.groq\.com/.test(cfg.baseUrl ?? "");
const supportsBrowserSearch = (cfg: AIConfig, model: string) => isGroq(cfg) && /^openai\/gpt-oss/.test(model);

export async function generateWithOpenAICompatible(
  cfg: AIConfig,
  input: GenerateInput,
  cb: GenerateCallbacks,
): Promise<GenerateResult> {
  if (!cfg.apiKey) {
    throw new UserFacingError(
      cfg.provider === "groq" ? "GROQ_API_KEY is not set on the server." : "LLM_API_KEY is not set on the server.",
      500,
    );
  }

  const all = [cfg.model, ...(cfg.fallbackModels ?? [])].filter((m, i, a) => m && a.indexOf(m) === i);
  // History is already trimmed to fit (see buildPromptMessages in the chat route).
  const trimmed = input;

  const primary = all[0];
  let primaryWaits = 0;
  const waitFor = async (ms: number) => {
    cb.onStatus("waiting", `${Math.max(1, Math.ceil(ms / 1000))}s`);
    await sleep(Math.max(ms, 0) + 400, input.signal);
  };

  // Smartest model first. If it's only briefly rate-limited, wait for it
  // rather than handing the reply to a weaker model. Otherwise fall back
  // through the chain, and if everything is briefly busy, wait and retry.
  for (let round = 0; round < 5; round++) {
    const primaryWait = (cooldownUntil.get(primary) ?? 0) - Date.now();
    if (primaryWait > 0 && primaryWait <= PREFER_SMART_WAIT_MS && primaryWaits < 2) {
      primaryWaits++;
      await waitFor(primaryWait);
      if (input.signal.aborted) return { text: "", sources: [] };
    }

    const now = Date.now();
    const ready = all.filter((m) => (cooldownUntil.get(m) ?? 0) <= now);
    let retryPrimarySoon = false;

    for (const model of ready) {
      try {
        const result = await runModel(model, cfg, trimmed, cb);
        cooldownUntil.delete(model);
        return result;
      } catch (err) {
        if (input.signal.aborted) return { text: "", sources: [] };
        if (!(err instanceof RetryableModelError)) throw err;
        console.warn(`[llm] ${model} busy (${err.message}); retry in ~${Math.round(err.retryAfterMs / 1000)}s`);
        cooldownUntil.set(model, Date.now() + Math.max(err.retryAfterMs, 1_000));
        if (model === primary && err.retryAfterMs <= PREFER_SMART_WAIT_MS && primaryWaits < 2) {
          retryPrimarySoon = true;
          break;
        }
      }
    }
    if (retryPrimarySoon) continue;

    const soonest = Math.min(...all.map((m) => cooldownUntil.get(m) ?? 0)) - Date.now();
    if (soonest > MAX_WAIT_MS) break;
    await waitFor(soonest);
    if (input.signal.aborted) return { text: "", sources: [] };
  }

  throw new UserFacingError(
    "Bro hit the free AI limit for now 😅 Give it a minute and try again, Rabe (free plans only allow so many messages per minute/day).",
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
  const search = cfg.webSearch && supportsBrowserSearch(cfg, model);

  let res: Response;
  try {
    res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      signal: input.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model,
        stream: true,
        max_tokens: cfg.maxTokens,
        messages: [
          { role: "system", content: [personaPrompt(search), runtimeContext(), input.context].filter(Boolean).join("\n\n") },
          ...input.messages,
        ],
        ...(search ? { tools: [{ type: "browser_search" }] } : {}),
        // Qwen on Groq: keep its thinking out of the reply.
        ...(isGroq(cfg) && /qwen/i.test(model) ? { reasoning_format: "hidden" } : {}),
      }),
    });
  } catch (err) {
    if (input.signal.aborted) throw err;
    console.error("[llm] connection error:", err);
    throw new UserFacingError("Couldn't reach the AI service. Check your internet connection.", 503);
  }

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    console.error(`[llm] ${model} HTTP ${res.status}:`, detail.slice(0, 400));
    if (res.status === 401) throw new UserFacingError("The AI key is invalid. Check the API key in .env.local.", 401);
    if (res.status === 429) {
      throw new RetryableModelError("rate limited", parseRetryAfter(detail, res.headers.get("retry-after")));
    }
    if (res.status === 413) throw new RetryableModelError("request too large", 60_000);
    if ([500, 502, 503].includes(res.status)) throw new RetryableModelError(`HTTP ${res.status}`, 15_000);
    if (res.status === 404 || /model_decommissioned|model_not_found/i.test(detail)) {
      throw new RetryableModelError("model unavailable", 6 * 60 * 60 * 1000);
    }
    throw new UserFacingError("The AI couldn't process that request. Try rephrasing or starting a new chat.", 400);
  }

  let text = "";
  const opened = new Map<string, Source>(); // pages the model actually read
  const found = new Map<string, Source>(); // search hits
  const announced = new Set<string>();
  const strip = new CitationStripper();

  const emit = (chunk: string) => {
    if (!chunk) return;
    if (!text) cb.onStatus("writing");
    text += chunk;
    cb.onText(chunk);
  };

  const onTool = (t: ExecutedTool) => {
    const key = `${t.index}:${t.type === "function" ? "start" : "done"}`;
    if (announced.has(key)) return;
    announced.add(key);

    if (t.type === "function") {
      // Tool call starting.
      let args: { query?: string } = {};
      try {
        args = JSON.parse(t.arguments ?? "{}");
      } catch {
        // ignore
      }
      if (t.name === "browser.search") cb.onStatus("searching", args.query);
      else if (t.name === "browser.open") cb.onStatus("reading");
      return;
    }

    // Tool call finished: collect sources.
    const results = t.search_results?.results ?? [];
    if (t.name === "browser.search") {
      for (const r of results) if (r.url && !found.has(r.url)) found.set(r.url, { url: r.url, title: cleanTitle(r.title, r.url) });
    } else if (t.name === "browser.open") {
      const failed = /You do not have access|Error fetching|403 Forbidden/i.test(t.output ?? "");
      const url = results[0]?.url;
      if (url && !failed && !opened.has(url)) {
        opened.set(url, { url, title: found.get(url)?.title ?? cleanTitle(results[0]?.title, url) });
        cb.onStatus("reading", hostname(url));
        cb.onSources([...opened.values()]);
      }
    }
  };

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
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
        const data = line.slice(5).trim();
        if (data === "[DONE]") continue;
        let json: StreamChunk;
        try {
          json = JSON.parse(data) as StreamChunk;
        } catch {
          continue;
        }
        const err = json.error ?? json.x_groq?.error;
        if (err) {
          console.error(`[llm] ${model} stream error:`, err);
          if (!text) throw new RetryableModelError(err.message ?? "stream error", parseRetryAfter(err.message ?? "", null));
          throw new UserFacingError("The AI stopped mid-reply. Please try again.", 502);
        }
        const delta = json.choices?.[0]?.delta;
        if (!delta) continue;
        for (const t of delta.executed_tools ?? []) onTool(t);
        if (delta.content) emit(strip.push(delta.content));
      }
    }
    emit(strip.flush());
  } catch (err) {
    if (input.signal.aborted) return { text, sources: finalSources() };
    if (err instanceof RetryableModelError || err instanceof UserFacingError) throw err;
    console.error("[llm] stream error:", err);
    throw new UserFacingError("The connection to the AI dropped mid-reply. Please try again.", 502);
  }

  if (!text.trim()) throw new RetryableModelError("empty reply", 5_000);

  const sources = finalSources();
  if (sources.length && opened.size === 0) cb.onSources(sources);
  return { text, sources };

  function finalSources(): Source[] {
    return (opened.size ? [...opened.values()] : [...found.values()].slice(0, 4)).slice(0, 6);
  }
}

/**
 * Removes GPT-OSS citation markers like 【3†L4-L10】 from streamed text,
 * even when a marker is split across chunks.
 */
class CitationStripper {
  private pending = "";
  push(chunk: string): string {
    let s = this.pending + chunk;
    this.pending = "";
    s = s.replace(/【[^】\n]{0,80}】/g, "");
    const open = s.lastIndexOf("【");
    if (open !== -1 && s.length - open < 80) {
      this.pending = s.slice(open);
      s = s.slice(0, open);
    }
    return s;
  }
  flush(): string {
    const rest = this.pending.replace(/【[^】\n]*】?/g, "");
    this.pending = "";
    return rest;
  }
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function cleanTitle(title: string | undefined, url: string): string {
  const t = (title ?? "").replace(/\s+-\s+viewing lines.*$/i, "").replace(/\s+/g, " ").trim();
  return t && t !== hostname(url) ? t.slice(0, 120) : hostname(url);
}
