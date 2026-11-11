/**
 * Small JSON-returning AI calls for background jobs (memory extraction).
 * Uses a fast model on Groq / any OpenAI-compatible API so the main
 * conversation model's rate limit isn't touched.
 */
import { getAIConfig } from "./config";

function endpoint(): { baseUrl: string; apiKey: string; models: string[] } | null {
  const cfg = getAIConfig();
  if (process.env.GROQ_API_KEY) {
    const models = (process.env.MEMORY_MODELS ?? "openai/gpt-oss-20b,qwen/qwen3.8-27b").split(",").map((s) => s.trim());
    return { baseUrl: "https://api.groq.com/openai/v1", apiKey: process.env.GROQ_API_KEY, models };
  }
  if (cfg.provider === "openai-compatible" && cfg.apiKey && cfg.baseUrl) {
    return { baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, models: [cfg.model] };
  }
  return null;
}

/** Returns parsed JSON, or null if unavailable/failed (callers treat it as "no changes"). */
export async function jsonCompletion(system: string, user: string, signal?: AbortSignal): Promise<unknown | null> {
  const ep = endpoint();
  if (!ep) return null;

  for (const model of ep.models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(`${ep.baseUrl}/chat/completions`, {
          method: "POST",
          signal,
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${ep.apiKey}` },
          body: JSON.stringify({
            model,
            temperature: 0,
            max_tokens: 1200,
            response_format: { type: "json_object" },
            ...(/gpt-oss/.test(model) ? { reasoning_effort: "low" } : {}),
            ...(/qwen/i.test(model) ? { reasoning_format: "hidden" } : {}),
            messages: [
              { role: "system", content: system },
              { role: "user", content: user },
            ],
          }),
        });
        if (res.status === 429) {
          const wait = Number(/try again in ([\d.]+)s/i.exec(await res.text())?.[1] ?? "99");
          if (attempt === 0 && wait <= 6) {
            await new Promise((r) => setTimeout(r, wait * 1000 + 250));
            continue;
          }
          break; // try the next model
        }
        if (!res.ok) {
          console.warn(`[json] ${model} HTTP ${res.status}`);
          break;
        }
        const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        const content = data.choices?.[0]?.message?.content ?? "";
        const start = content.indexOf("{");
        const end = content.lastIndexOf("}");
        if (start === -1 || end <= start) break;
        return JSON.parse(content.slice(start, end + 1));
      } catch (err) {
        if (signal?.aborted) return null;
        console.warn(`[json] ${model} failed:`, (err as Error).message);
        break;
      }
    }
  }
  return null;
}
