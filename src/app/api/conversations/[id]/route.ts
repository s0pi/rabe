import { getStore } from "@/lib/db";
import { errorJson, getVisitorId, json } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Get one conversation with its messages. */
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    const visitorId = await getVisitorId();
    const store = getStore();
    const conversation = await store.getConversation(visitorId, id);
    if (!conversation) return errorJson("Conversation not found.", 404);
    const stored = await store.getMessages(visitorId, id);
    // The UI only needs attachment names/thumbnails, not the extracted text.
    const messages = stored.map((m) =>
      m.attachments ? { ...m, attachments: m.attachments.map(({ text: _text, ...meta }) => meta) } : m,
    );
    return json({ conversation: { ...conversation, messages } });
  } catch (err) {
    console.error("[conversation] get failed:", err);
    return errorJson("Couldn't load this conversation.", 500);
  }
}

/** Rename a conversation. */
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  let title = "";
  try {
    const body = (await req.json()) as { title?: unknown };
    title = typeof body.title === "string" ? body.title.replace(/\s+/g, " ").trim().slice(0, 80) : "";
  } catch {
    return errorJson("Invalid JSON body.");
  }
  if (!title) return errorJson("Title can't be empty.");
  try {
    const visitorId = await getVisitorId();
    const conversation = await getStore().renameConversation(visitorId, id, title);
    if (!conversation) return errorJson("Conversation not found.", 404);
    return json({ conversation });
  } catch (err) {
    console.error("[conversation] rename failed:", err);
    return errorJson("Couldn't rename this conversation.", 500);
  }
}

/** Delete a conversation. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    const visitorId = await getVisitorId();
    const ok = await getStore().deleteConversation(visitorId, id);
    if (!ok) return errorJson("Conversation not found.", 404);
    return json({ ok: true });
  } catch (err) {
    console.error("[conversation] delete failed:", err);
    return errorJson("Couldn't delete this conversation.", 500);
  }
}
