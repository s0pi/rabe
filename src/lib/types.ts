/** Types shared by the server (API routes) and the client (UI). */

export type Role = "user" | "assistant";

export interface Source {
  url: string;
  title: string;
}

export type AttachmentKind = "image" | "pdf" | "docx" | "pptx";

/** What the UI needs to show an attachment. */
export interface AttachmentMeta {
  id: string;
  name: string;
  kind: AttachmentKind;
  size: number;
  /** Pages (PDF) or slides (PPTX). */
  pages?: number;
  /** Small thumbnail (data URL) for images. */
  preview?: string;
  /** Shown to Rabe, e.g. "Only the first 40 pages were read." */
  note?: string;
}

/** Attachment including the text Bro reads (extracted text or image transcription). */
export interface Attachment extends AttachmentMeta {
  text: string;
}

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  sources?: Source[];
  attachments?: AttachmentMeta[];
  createdAt: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationWithMessages extends ConversationSummary {
  messages: ChatMessage[];
}

/** One long-term memory fact Bro keeps about Rabe. */
export interface Memory {
  key: string;
  value: string;
  updatedAt: string;
}

export interface MemoryChange {
  key: string;
  /** New value, or null when the fact was forgotten. */
  value: string | null;
  previous?: string | null;
}

/** Events streamed from POST /api/chat as newline-delimited JSON. */
export type ChatStreamEvent =
  | { type: "meta"; conversation: ConversationSummary; userMessageId: string }
  | { type: "text"; delta: string }
  | { type: "status"; status: "thinking" | "searching" | "reading" | "writing" | "waiting"; detail?: string }
  | { type: "sources"; sources: Source[] }
  | { type: "memory"; changes: MemoryChange[] }
  | { type: "done"; messageId: string | null }
  | { type: "error"; message: string };

export interface PublicConfig {
  provider: string;
  model: string;
  webSearch: boolean;
  configured: boolean;
  storage: "postgres" | "local-file";
  /** True when the app is protected by APP_PASSCODE. */
  locked: boolean;
  /** True when photos can be read (a vision model is available). */
  vision: boolean;
}
