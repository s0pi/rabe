import { getStore } from "@/lib/db";
import { errorJson, getVisitorId, json } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** List this visitor's conversations (newest first). */
export async function GET() {
  try {
    const visitorId = await getVisitorId();
    const conversations = await getStore().listConversations(visitorId);
    return json({ conversations });
  } catch (err) {
    console.error("[conversations] list failed:", err);
    return errorJson("Couldn't load chat history.", 500);
  }
}

/** Clear all of this visitor's conversations. */
export async function DELETE() {
  try {
    const visitorId = await getVisitorId();
    const deleted = await getStore().clearConversations(visitorId);
    return json({ deleted });
  } catch (err) {
    console.error("[conversations] clear failed:", err);
    return errorJson("Couldn't clear chat history.", 500);
  }
}
