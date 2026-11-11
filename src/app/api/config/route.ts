import { getAIConfig, isAIConfigured } from "@/lib/ai/config";
import { getStore } from "@/lib/db";
import { passcodeEnabled } from "@/lib/auth";
import { visionAvailable } from "@/lib/attachments/vision";
import { json } from "@/lib/server";
import type { PublicConfig } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Non-secret info about how the server is configured (shown in Settings). */
export async function GET() {
  const cfg = getAIConfig();
  const body: PublicConfig = {
    provider: cfg.provider,
    model:
      cfg.provider === "gemini"
        ? `Gemini auto (${[cfg.model, ...(cfg.fallbackModels ?? [])].map((m) => m.replace(/^gemini-|-latest$/g, "")).join(" → ")})`
        : cfg.provider === "groq"
          ? `${cfg.model.replace(/^openai\//, "")} · Groq`
          : cfg.model,
    webSearch: cfg.webSearch,
    configured: isAIConfigured(cfg),
    storage: getStore().kind,
    locked: passcodeEnabled(),
    vision: visionAvailable(),
  };
  return json(body);
}
