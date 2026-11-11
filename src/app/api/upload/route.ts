import { AttachmentError, MAX_UPLOAD_BYTES, readAttachment } from "@/lib/attachments/extract";
import { errorJson, getVisitorId, json, rateLimited } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Reads one attached file (photo, PDF, .docx, .pptx) and returns it with the
 * text Bro will read. The client sends it back with the chat message.
 */
export async function POST(req: Request) {
  const visitorId = await getVisitorId();
  if (rateLimited(`upload:${visitorId}`)) {
    return errorJson("Too many uploads at once. Wait a minute and try again.", 429);
  }

  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("file");
    file = f instanceof File ? f : null;
  } catch {
    return errorJson("Couldn't read the upload. Try again.");
  }
  if (!file) return errorJson("No file received.");
  if (file.size > MAX_UPLOAD_BYTES) return errorJson("That file is too big (max 4 MB).", 413);

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const attachment = await readAttachment(file.name, buf);
    return json({ attachment });
  } catch (err) {
    if (err instanceof AttachmentError) return errorJson(err.message, 422);
    console.error("[upload] failed:", err);
    const msg = (err as Error).message ?? "";
    if (/vision|GROQ|ANTHROPIC/i.test(msg)) {
      return errorJson("Bro couldn't look at that photo right now (image reader busy or not set up). Try again in a bit.", 503);
    }
    return errorJson("Something went wrong reading that file. Try again.", 500);
  }
}
