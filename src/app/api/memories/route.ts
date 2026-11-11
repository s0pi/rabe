import { getStore } from "@/lib/db";
import { normalizeKey } from "@/lib/memory";
import { errorJson, getVisitorId, json } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Everything Bro remembers about Rabe. */
export async function GET() {
  try {
    const memories = await getStore().listMemories(await getVisitorId());
    return json({ memories });
  } catch (err) {
    console.error("[memories] list failed:", err);
    return errorJson("Couldn't load Bro's memory.", 500);
  }
}

/** Add or edit a memory: { key, value } (optional oldKey to rename). */
export async function PUT(req: Request) {
  let body: { key?: unknown; value?: unknown; oldKey?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return errorJson("Invalid JSON body.");
  }
  const key = typeof body.key === "string" ? normalizeKey(body.key) : "";
  const value = typeof body.value === "string" ? body.value.trim().slice(0, 300) : "";
  if (!key) return errorJson("Give it a short name, like favorite_food.");
  if (!value) return errorJson("The value can't be empty.");
  try {
    const visitorId = await getVisitorId();
    const store = getStore();
    const oldKey = typeof body.oldKey === "string" ? normalizeKey(body.oldKey) : "";
    if (oldKey && oldKey !== key) await store.deleteMemory(visitorId, oldKey);
    const memory = await store.setMemory(visitorId, key, value);
    return json({ memory });
  } catch (err) {
    console.error("[memories] save failed:", err);
    return errorJson("Couldn't save that memory.", 500);
  }
}

/** Forget one memory: DELETE /api/memories?key=favorite_food */
export async function DELETE(req: Request) {
  const key = normalizeKey(new URL(req.url).searchParams.get("key") ?? "");
  if (!key) return errorJson("Which memory?");
  try {
    const ok = await getStore().deleteMemory(await getVisitorId(), key);
    return ok ? json({ ok: true }) : errorJson("Memory not found.", 404);
  } catch (err) {
    console.error("[memories] delete failed:", err);
    return errorJson("Couldn't delete that memory.", 500);
  }
}
