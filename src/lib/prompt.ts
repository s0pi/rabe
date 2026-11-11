/**
 * Assembles the conversation the AI reads for one reply:
 * trimmed older history + the newest message with its attachments.
 */
import type { HistoryMessage } from "@/lib/ai";
import type { StoredMessage } from "@/lib/db/types";
import type { Attachment } from "@/lib/types";
import { formatAttachments, mentionAttachments } from "@/lib/attachments/context";

interface Budgets {
  historyChars: number;
  attachmentChars: number;
}

/** Words that suggest Rabe is talking about a file he sent earlier. */
const FILE_REFERENCE =
  /\b(file|pdf|docx?|word|ppt|pptx|powerpoint|slides?|page|pages|photo|picture|pic|image|screenshot|document|attachment|assignment|worksheet|module|activity|quiz|question|number|item|no\.|#\d|this|that|it|ani|kini|kana|ito|iyan|yan)\b/i;

export function buildPromptMessages(
  past: StoredMessage[],
  current: { content: string; attachments: Attachment[] },
  budgets: Budgets,
): HistoryMessage[] {
  const question = current.content.trim();

  // Files to show in full: the ones attached now, or (for a follow-up) the most recent earlier ones.
  let focus = current.attachments;
  let fromEarlier = false;
  if (!focus.length) {
    const userTurns = past.filter((m) => m.role === "user");
    const idx = userTurns.findLastIndex((m) => m.attachments?.length);
    if (idx !== -1) {
      const recent = userTurns.length - idx <= 4;
      if (recent || FILE_REFERENCE.test(question)) {
        focus = userTurns[idx].attachments!;
        fromEarlier = true;
      }
    }
  }

  // Older messages: plain text, with attachments only mentioned by name.
  const older: HistoryMessage[] = past.map((m) => ({
    role: m.role,
    content:
      m.role === "user" && m.attachments?.length
        ? [mentionAttachments(m.attachments), m.content].filter(Boolean).join("\n")
        : m.content,
  }));

  // Keep the newest older messages within budget.
  let total = 0;
  let start = older.length;
  while (start > 0) {
    const len = older[start - 1].content.length;
    if (total + len > budgets.historyChars) break;
    total += len;
    start--;
  }
  const kept = older.slice(start);
  while (kept.length && kept[0].role !== "user") kept.shift();

  let content = question;
  if (focus.length) {
    const block = formatAttachments(
      focus,
      question,
      budgets.attachmentChars,
      fromEarlier
        ? "Files Rabe attached earlier in this chat (shown again so you can answer his follow-up):"
        : "Rabe attached these files:",
    );
    const ask = question
      ? `Rabe's message: ${question}`
      : "Rabe sent the files above without a message. Tell him briefly what they are and help with the obvious task (e.g. a worksheet or assignment), or ask what he needs.";
    content = `${block}\n\n${ask}`;
  }

  return [...kept, { role: "user", content }];
}
