import { generateReply, UserFacingError } from "@/lib/ai";
import { getAIConfig, isAIConfigured } from "@/lib/ai/config";
import { jsonCompletion } from "@/lib/ai/json";
import { getStore } from "@/lib/db";
import type { StoredMessage } from "@/lib/db/types";
import { extractMemoryChanges, memoryContext } from "@/lib/memory";
import { buildPromptMessages } from "@/lib/prompt";
import { errorJson, getVisitorId, HISTORY_LIMIT, makeTitle, MAX_MESSAGE_CHARS, rateLimited } from "@/lib/server";
import type { Attachment, AttachmentKind, ChatStreamEvent, MemoryChange, Source } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_ATTACHMENTS = 5;
const KINDS: AttachmentKind[] = ["image", "pdf", "docx", "pptx"];

interface ChatBody {
  conversationId?: string | null;
  message?: string;
  attachments?: unknown;
  /** Re-run a reply for the last user message without storing it again. */
  retry?: boolean;
}

/** Validates attachments sent back by the client (they come from /api/upload). */
function parseAttachments(raw: unknown): Attachment[] {
  if (!Array.isArray(raw)) return [];
  const out: Attachment[] = [];
  for (const a of raw.slice(0, MAX_ATTACHMENTS)) {
    if (!a || typeof a !== "object") continue;
    const x = a as Record<string, unknown>;
    if (typeof x.id !== "string" || typeof x.name !== "string" || typeof x.text !== "string") continue;
    if (!KINDS.includes(x.kind as AttachmentKind)) continue;
    const preview = typeof x.preview === "string" && x.preview.startsWith("data:image/") && x.preview.length < 120_000 ? x.preview : undefined;
    out.push({
      id: x.id.slice(0, 64),
      name: x.name.slice(0, 120),
      kind: x.kind as AttachmentKind,
      size: typeof x.size === "number" ? x.size : 0,
      ...(typeof x.pages === "number" ? { pages: x.pages } : {}),
      ...(preview ? { preview } : {}),
      ...(typeof x.note === "string" && x.note ? { note: x.note.slice(0, 300) } : {}),
      text: x.text.slice(0, 120_000),
    });
  }
  return out;
}

export async function POST(req: Request) {
  let body: ChatBody;
  try {
    body = (await req.json()) as ChatBody;
  } catch {
    return errorJson("Invalid JSON body.");
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  let attachments = parseAttachments(body.attachments);
  if (!message && !attachments.length) return errorJson("Message can't be empty.");
  if (message.length > MAX_MESSAGE_CHARS) {
    return errorJson(`Message is too long (max ${MAX_MESSAGE_CHARS.toLocaleString()} characters).`);
  }
  if (!isAIConfigured()) {
    return errorJson("The AI isn't configured yet. Add your API key to the server environment (see README).", 503);
  }

  const visitorId = await getVisitorId();
  if (rateLimited(visitorId)) {
    return errorJson("Whoa, slow down lodi! Too many messages. Wait a minute and try again.", 429);
  }

  const store = getStore();
  const cfg = getAIConfig();

  // Resolve (or create) the conversation and save Rabe's message.
  let conversation;
  let past: StoredMessage[] = [];
  let userMessageId: string;
  let memories;
  try {
    const titleBase = message || attachments.map((a) => a.name).join(", ");
    if (body.conversationId) {
      conversation = await store.getConversation(visitorId, body.conversationId);
      if (!conversation) return errorJson("Conversation not found.", 404);
      past = await store.getMessages(visitorId, conversation.id, HISTORY_LIMIT + 1);
    } else {
      conversation = await store.createConversation(visitorId, makeTitle(titleBase));
    }

    const last = past.at(-1);
    if (body.retry && last?.role === "user" && last.content === message) {
      past = past.slice(0, -1);
      if (!attachments.length && last.attachments?.length) attachments = last.attachments;
      userMessageId = last.id;
    } else {
      userMessageId = (
        await store.addMessage(visitorId, conversation.id, { role: "user", content: message, attachments })
      ).id;
    }
    memories = await store.listMemories(visitorId);
  } catch (err) {
    console.error("[chat] storage error:", err);
    return errorJson("Couldn't save your message. The database may be unavailable.", 500);
  }

  const messages = buildPromptMessages(past.slice(-HISTORY_LIMIT), { content: message, attachments }, cfg);

  // Check what Bro should remember from this message (small, fast model).
  const previousAssistant = [...past].reverse().find((m) => m.role === "assistant")?.content;
  const memoryJob: Promise<MemoryChange[]> = message
    ? extractMemoryChanges({ userMessage: message, previousAssistant, memories }, (s, u) => jsonCompletion(s, u)).catch(
        (err) => {
          console.warn("[memory] extraction failed:", err);
          return [];
        },
      )
    : Promise.resolve([]);
  const memoryStore = store;
  const memoryOwner = visitorId;
  let memoryApplied = false;
  /** Saves memory changes; returns the ones that actually changed something. */
  const applyMemory = async (changes: MemoryChange[]) => {
    memoryApplied = true;
    const applied: MemoryChange[] = [];
    for (const c of changes) {
      if (c.value === null) {
        if (await memoryStore.deleteMemory(memoryOwner, c.key)) applied.push(c);
      } else {
        await memoryStore.setMemory(memoryOwner, c.key, c.value);
        applied.push(c);
      }
    }
    return applied;
  };

  const encoder = new TextEncoder();
  const abort = new AbortController();
  req.signal.addEventListener("abort", () => abort.abort());
  const conv = conversation;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: ChatStreamEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          closed = true;
        }
      };

      send({ type: "meta", conversation: conv, userMessageId });
      send({ type: "status", status: "thinking" });

      // Give the memory check a moment so a new/corrected fact (like a
      // birthday) is already saved, and its exact countdown computed, before
      // Bro answers. If it's slow, Bro answers anyway and memory saves after.
      let context = memoryContext(memories);
      try {
        const early = await Promise.race([memoryJob, new Promise<null>((r) => setTimeout(() => r(null), 3_000))]);
        if (early) {
          const applied = await applyMemory(early);
          if (applied.length) {
            send({ type: "memory", changes: applied });
            context = memoryContext(await memoryStore.listMemories(memoryOwner));
          }
        }
      } catch (err) {
        console.error("[memory] early save failed:", err);
      }

      let text = "";
      let sources: Source[] = [];
      let failed = false;
      try {
        const result = await generateReply(
          { messages, signal: abort.signal, context },
          {
            onText: (delta) => {
              text += delta;
              send({ type: "text", delta });
            },
            onStatus: (status, detail) => send({ type: "status", status, detail }),
            onSources: (s) => {
              sources = s;
              send({ type: "sources", sources: s });
            },
          },
        );
        text = result.text;
        sources = result.sources;
      } catch (err) {
        failed = true;
        const msg = err instanceof UserFacingError ? err.message : "Something went wrong. Please try again.";
        if (!(err instanceof UserFacingError)) console.error("[chat] generation error:", err);
        send({ type: "error", message: msg });
      }

      // Save complete replies, and partial ones Rabe stopped on purpose.
      // Failed replies aren't saved so "Try again" can regenerate cleanly.
      let messageId: string | null = null;
      if (text.trim() && !failed) {
        try {
          const saved = await store.addMessage(visitorId, conv.id, { role: "assistant", content: text, sources });
          messageId = saved.id;
        } catch (err) {
          console.error("[chat] failed to save reply:", err);
        }
      }

      // If the memory check was slower than the reply, save its results now.
      if (!memoryApplied) {
        try {
          const changes = await Promise.race([
            memoryJob,
            new Promise<MemoryChange[]>((r) => setTimeout(() => r([]), 15_000)),
          ]);
          const applied = await applyMemory(changes);
          if (applied.length) send({ type: "memory", changes: applied });
        } catch (err) {
          console.error("[memory] failed to save:", err);
        }
      }

      if (!failed) send({ type: "done", messageId });
      closed = true;
      try {
        controller.close();
      } catch {
        // already closed by client disconnect
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
