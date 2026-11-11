import { getAIConfig } from "./config";
import { generateWithAnthropic } from "./providers/anthropic";
import { generateWithGemini } from "./providers/gemini";
import { generateWithOpenAICompatible } from "./providers/openai-compatible";
import type { GenerateCallbacks, GenerateInput, GenerateResult } from "./providers/types";

export { UserFacingError } from "./providers/types";
export type { HistoryMessage } from "./providers/types";

/** Runs one RABÉ reply on whichever provider is configured. */
export function generateReply(input: GenerateInput, cb: GenerateCallbacks): Promise<GenerateResult> {
  const cfg = getAIConfig();
  switch (cfg.provider) {
    case "gemini":
      return generateWithGemini(cfg, input, cb);
    case "groq":
    case "openai-compatible":
      return generateWithOpenAICompatible(cfg, input, cb);
    default:
      return generateWithAnthropic(cfg, input, cb);
  }
}
