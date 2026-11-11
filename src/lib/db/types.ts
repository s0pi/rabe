import type { Attachment, ConversationSummary, Memory, Role, Source } from "@/lib/types";

export interface NewMessage {
  role: Role;
  content: string;
  sources?: Source[];
  attachments?: Attachment[];
}

/** A stored message, including attachment text (server-side only). */
export interface StoredMessage {
  id: string;
  role: Role;
  content: string;
  sources?: Source[];
  attachments?: Attachment[];
  createdAt: string;
}

/** Storage contract. Every call is scoped to a visitor (the owner in passcode mode). */
export interface ChatStore {
  readonly kind: "postgres" | "local-file";
  listConversations(visitorId: string): Promise<ConversationSummary[]>;
  getConversation(visitorId: string, id: string): Promise<ConversationSummary | null>;
  getMessages(visitorId: string, conversationId: string, limit?: number): Promise<StoredMessage[]>;
  createConversation(visitorId: string, title: string): Promise<ConversationSummary>;
  renameConversation(visitorId: string, id: string, title: string): Promise<ConversationSummary | null>;
  deleteConversation(visitorId: string, id: string): Promise<boolean>;
  clearConversations(visitorId: string): Promise<number>;
  addMessage(visitorId: string, conversationId: string, msg: NewMessage): Promise<StoredMessage>;

  listMemories(visitorId: string): Promise<Memory[]>;
  setMemory(visitorId: string, key: string, value: string): Promise<Memory>;
  deleteMemory(visitorId: string, key: string): Promise<boolean>;
}
