/** Reads AI settings from environment variables (server-only). */

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
export type Provider = "groq" | "gemini" | "anthropic" | "openai-compatible";

export interface AIConfig {
  provider: Provider;
  model: string;
  fallbackModels?: string[];
  effort: Effort;
  maxTokens: number;
  webSearch: boolean;
  fallbacks: boolean;
  baseUrl?: string;
  apiKey?: string;
  /** Max characters of older chat history sent per request. */
  historyChars: number;
  /** Max characters of attachment text sent per request. */
  attachmentChars: number;
}

const EFFORTS: Effort[] = ["low", "medium", "high", "xhigh", "max"];
const PROVIDERS: Provider[] = ["groq", "gemini", "anthropic", "openai-compatible"];

/**
 * LLM_PROVIDER picks the provider explicitly. If it's empty, the first
 * provider with a key wins: Groq (free) → Gemini (free) → Anthropic → other.
 */
function pickProvider(): Provider {
  const p = (process.env.LLM_PROVIDER ?? "").trim().toLowerCase() as Provider;
  if (PROVIDERS.includes(p)) return p;
  if (process.env.GROQ_API_KEY) return "groq";
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.LLM_API_KEY) return "openai-compatible";
  return "groq";
}

function intEnv(name: string, fallback: number) {
  const n = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function listEnv(name: string, fallback: string): string[] {
  return (process.env[name] ?? fallback)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function getAIConfig(): AIConfig {
  const provider = pickProvider();
  const webSearch = process.env.ENABLE_WEB_SEARCH !== "false";

  switch (provider) {
    case "groq":
      return {
        provider,
        // Smartest free Groq model first; GPT-OSS models also get free web search.
        model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
        fallbackModels: listEnv("GROQ_FALLBACK_MODELS", "openai/gpt-oss-20b,qwen/qwen3.8-27b"),
        effort: "medium",
        maxTokens: intEnv("LLM_MAX_TOKENS", 8192),
        webSearch,
        fallbacks: false,
        baseUrl: "https://api.groq.com/openai/v1",
        apiKey: process.env.GROQ_API_KEY,
        // Groq's free tier allows ~8k tokens per request/minute, so keep it lean.
        historyChars: intEnv("HISTORY_CHARS", 4_000),
        attachmentChars: intEnv("ATTACHMENT_CHARS", 8_000),
      };

    case "gemini":
      return {
        provider,
        // Smartest first. Pro may have little or no free quota; RABÉ then
        // falls back to Flash (very capable) and Flash-Lite (largest free quota).
        model: process.env.GEMINI_MODEL || "gemini-pro-latest",
        fallbackModels: listEnv("GEMINI_FALLBACK_MODELS", "gemini-flash-latest,gemini-flash-lite-latest"),
        effort: "medium",
        maxTokens: intEnv("LLM_MAX_TOKENS", 8192),
        webSearch,
        fallbacks: false,
        apiKey: process.env.GEMINI_API_KEY,
        historyChars: intEnv("HISTORY_CHARS", 30_000),
        attachmentChars: intEnv("ATTACHMENT_CHARS", 80_000),
      };

    case "openai-compatible":
      return {
        provider,
        model: process.env.LLM_MODEL || "gpt-4o-mini",
        fallbackModels: listEnv("LLM_FALLBACK_MODELS", ""),
        effort: "medium",
        maxTokens: intEnv("LLM_MAX_TOKENS", 4096),
        webSearch: false,
        fallbacks: false,
        baseUrl: (process.env.LLM_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, ""),
        apiKey: process.env.LLM_API_KEY,
        historyChars: intEnv("HISTORY_CHARS", 12_000),
        attachmentChars: intEnv("ATTACHMENT_CHARS", 20_000),
      };

    default: {
      const effortEnv = (process.env.LLM_EFFORT ?? "medium").toLowerCase() as Effort;
      return {
        provider: "anthropic",
        model: process.env.LLM_MODEL || "claude-opus-5-5",
        effort: EFFORTS.includes(effortEnv) ? effortEnv : "medium",
        maxTokens: intEnv("LLM_MAX_TOKENS", 32000),
        webSearch,
        fallbacks: process.env.ANTHROPIC_FALLBACKS !== "off",
        historyChars: intEnv("HISTORY_CHARS", 60_000),
        attachmentChars: intEnv("ATTACHMENT_CHARS", 150_000),
      };
    }
  }
}

export function isAIConfigured(cfg = getAIConfig()): boolean {
  if (cfg.provider === "anthropic") {
    return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  }
  return Boolean(cfg.apiKey);
}
