import Anthropic from "@anthropic-ai/sdk";
import type { Source } from "@/lib/types";
import type { AIConfig } from "@/lib/ai/config";
import { personaPrompt, runtimeContext } from "@/lib/ai/persona";
import {
  UserFacingError,
  type GenerateCallbacks,
  type GenerateInput,
  type GenerateResult,
} from "./types";

type BetaMessageParam = Anthropic.Beta.BetaMessageParam;
type BetaToolUnion = Anthropic.Beta.BetaToolUnion;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  // Reads ANTHROPIC_API_KEY (or ANTHROPIC_AUTH_TOKEN) from the environment.
  client ??= new Anthropic({ maxRetries: 2 });
  return client;
}

/** Models that accept server-side refusal fallbacks (`fallbacks: "default"`). */
const FALLBACK_MODELS = [
  "claude-fable-5-2",
  "claude-fable-5-1",
  "claude-opus-5-5",
  "claude-opus-5",
  "claude-sonnet-5-5",
];

/** Models that support the dynamic-filtering web tools (`*_20260209`). */
const DYNAMIC_WEB_MODELS = /^claude-(fable|mythos|opus-5|opus-4-[678]|sonnet-5|sonnet-4-6)/;

function webTools(model: string): BetaToolUnion[] {
  const userLocation = {
    type: "approximate" as const,
    country: "PH",
    timezone: "Asia/Manila",
  };
  if (DYNAMIC_WEB_MODELS.test(model)) {
    return [
      { type: "web_search_20260209", name: "web_search", max_uses: 5, user_location: userLocation },
      { type: "web_fetch_20260209", name: "web_fetch", max_uses: 3 },
    ];
  }
  return [
    { type: "web_search_20250305", name: "web_search", max_uses: 5, user_location: userLocation },
    { type: "web_fetch_20250910", name: "web_fetch", max_uses: 3 },
  ];
}

const MAX_CONTINUATIONS = 4;

export async function generateWithAnthropic(
  cfg: AIConfig,
  input: GenerateInput,
  cb: GenerateCallbacks,
): Promise<GenerateResult> {
  const anthropic = getClient();
  const messages: BetaMessageParam[] = input.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const tools = cfg.webSearch ? webTools(cfg.model) : undefined;
  const useFallbacks = cfg.fallbacks && FALLBACK_MODELS.includes(cfg.model);

  let text = "";
  const cited = new Map<string, Source>();
  const found = new Map<string, Source>();

  cb.onStatus("thinking");

  try {
    for (let turn = 0; turn <= MAX_CONTINUATIONS; turn++) {
      const stream = anthropic.beta.messages.stream(
        {
          model: cfg.model,
          max_tokens: cfg.maxTokens,
          system: [
            // Stable persona first (cacheable), volatile date/time after it.
            { type: "text", text: personaPrompt(cfg.webSearch), cache_control: { type: "ephemeral" } },
            { type: "text", text: [runtimeContext(), input.context].filter(Boolean).join("\n\n") },
          ],
          messages,
          ...(tools ? { tools } : {}),
          output_config: { effort: cfg.effort },
          ...(useFallbacks
            ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
            : {}),
        },
        { signal: input.signal },
      );

      for await (const event of stream) {
        if (event.type === "content_block_start") {
          const block = event.content_block;
          if (block.type === "server_tool_use") {
            cb.onStatus(block.name === "web_fetch" ? "reading" : "searching");
          } else if (block.type === "thinking") {
            cb.onStatus("thinking");
          } else if (block.type === "text") {
            cb.onStatus("writing");
          }
        } else if (event.type === "content_block_delta") {
          const delta = event.delta;
          if (delta.type === "text_delta") {
            text += delta.text;
            cb.onText(delta.text);
          } else if (
            delta.type === "citations_delta" &&
            delta.citation.type === "web_search_result_location"
          ) {
            const { url, title } = delta.citation;
            if (!cited.has(url)) {
              cited.set(url, { url, title: title || hostname(url) });
              cb.onSources([...cited.values()]);
            }
          }
        } else if (event.type === "content_block_stop") {
          const block = stream.currentMessage?.content[event.index];
          if (!block) continue;
          if (block.type === "server_tool_use") {
            const input = block.input as { query?: unknown; url?: unknown };
            if (block.name === "web_search" && typeof input.query === "string") {
              cb.onStatus("searching", input.query);
            } else if (block.name === "web_fetch" && typeof input.url === "string") {
              cb.onStatus("reading", hostname(input.url));
            }
          } else if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
            for (const r of block.content) {
              if (!found.has(r.url)) found.set(r.url, { url: r.url, title: r.title || hostname(r.url) });
            }
          }
        }
      }

      const final = await stream.finalMessage();

      if (final.stop_reason === "pause_turn") {
        // Server-side tool loop paused; send the turn back so it resumes.
        messages.push({ role: "assistant", content: final.content });
        continue;
      }

      if (final.stop_reason === "refusal" && !text.trim()) {
        const note =
          "Ay, that one's off-limits for me, pre. Even handsome AIs have rules 😅 Try asking it a different way, or let's talk about something else!";
        text += note;
        cb.onText(note);
      }
      break;
    }
  } catch (err) {
    if (input.signal.aborted) return finish();
    throw toUserFacing(err);
  }

  return finish();

  function finish(): GenerateResult {
    // Prefer sources the model actually cited; otherwise show top search hits.
    const sources = cited.size > 0 ? [...cited.values()] : [...found.values()].slice(0, 5);
    if (cited.size === 0 && sources.length > 0) cb.onSources(sources);
    return { text, sources: sources.slice(0, 8) };
  }
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function toUserFacing(err: unknown): UserFacingError {
  if (err instanceof UserFacingError) return err;
  if (err instanceof Anthropic.AuthenticationError) {
    return new UserFacingError("The AI key is invalid or missing. Check ANTHROPIC_API_KEY on the server.", 401);
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return new UserFacingError("This API key doesn't have access to the configured model.", 403);
  }
  if (err instanceof Anthropic.NotFoundError) {
    return new UserFacingError("The configured model wasn't found. Check LLM_MODEL on the server.", 404);
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new UserFacingError("Bro is getting too many messages right now. Give it a few seconds and try again.", 429);
  }
  if (err instanceof Anthropic.BadRequestError) {
    console.error("[anthropic] bad request:", err.message);
    return new UserFacingError("The AI couldn't process that request. Try rephrasing or starting a new chat.", 400);
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new UserFacingError("Couldn't reach the AI service. Check your connection and try again.", 503);
  }
  if (err instanceof Anthropic.APIError) {
    console.error("[anthropic] api error:", err.status, err.message);
    return new UserFacingError("The AI service had a hiccup. Please try again.", 502);
  }
  console.error("[anthropic] unexpected error:", err);
  return new UserFacingError("Something went wrong while generating a reply.", 500);
}
