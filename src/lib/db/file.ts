/**
 * Local JSON-file store for development when DATABASE_URL is not set.
 * Not meant for production: serverless hosts have ephemeral filesystems.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import type { ConversationSummary, Memory } from "@/lib/types";
import type { ChatStore, NewMessage, StoredMessage } from "./types";

interface StoredConversation extends ConversationSummary {
  visitorId: string;
  messages: StoredMessage[];
}
interface StoredMemory extends Memory {
  visitorId: string;
}
interface DbFile {
  conversations: StoredConversation[];
  memories?: StoredMemory[];
}

const DATA_DIR =
  process.env.NODE_ENV === "production" && process.env.VERCEL
    ? path.join(os.tmpdir(), "rabe")
    : path.join(process.cwd(), ".data");
const DB_PATH = path.join(DATA_DIR, "rabe-db.json");

let cache: DbFile | null = null;
let queue: Promise<unknown> = Promise.resolve();

async function load(): Promise<DbFile> {
  if (cache) return cache;
  try {
    cache = JSON.parse(await fs.readFile(DB_PATH, "utf8")) as DbFile;
    if (!Array.isArray(cache.conversations)) cache = { conversations: [] };
  } catch {
    cache = { conversations: [] };
  }
  return cache;
}

async function persist(db: DbFile) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${DB_PATH}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(db), "utf8");
  await fs.rename(tmp, DB_PATH);
}

/** Serialize all access so concurrent requests can't clobber the file. */
function run<T>(fn: (db: DbFile) => T | Promise<T>, write = false): Promise<T> {
  const next = queue.then(async () => {
    const db = await load();
    const out = await fn(db);
    if (write) await persist(db);
    return out;
  });
  queue = next.catch(() => undefined);
  return next;
}

const summary = ({ id, title, createdAt, updatedAt }: StoredConversation): ConversationSummary => ({
  id,
  title,
  createdAt,
  updatedAt,
});

const find = (db: DbFile, visitorId: string, id: string) =>
  db.conversations.find((c) => c.id === id && c.visitorId === visitorId);

export const fileStore: ChatStore = {
  kind: "local-file",

  listConversations: (visitorId) =>
    run((db) =>
      db.conversations
        .filter((c) => c.visitorId === visitorId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 200)
        .map(summary),
    ),

  getConversation: (visitorId, id) =>
    run((db) => {
      const c = find(db, visitorId, id);
      return c ? summary(c) : null;
    }),

  getMessages: (visitorId, conversationId, limit = 500) =>
    run((db) => find(db, visitorId, conversationId)?.messages.slice(-limit) ?? []),

  createConversation: (visitorId, title) =>
    run((db) => {
      const now = new Date().toISOString();
      const conv: StoredConversation = {
        id: randomUUID(),
        visitorId,
        title,
        createdAt: now,
        updatedAt: now,
        messages: [],
      };
      db.conversations.push(conv);
      return summary(conv);
    }, true),

  renameConversation: (visitorId, id, title) =>
    run((db) => {
      const c = find(db, visitorId, id);
      if (!c) return null;
      c.title = title;
      return summary(c);
    }, true),

  deleteConversation: (visitorId, id) =>
    run((db) => {
      const before = db.conversations.length;
      db.conversations = db.conversations.filter((c) => !(c.id === id && c.visitorId === visitorId));
      return db.conversations.length < before;
    }, true),

  clearConversations: (visitorId) =>
    run((db) => {
      const before = db.conversations.length;
      db.conversations = db.conversations.filter((c) => c.visitorId !== visitorId);
      return before - db.conversations.length;
    }, true),

  addMessage: (visitorId, conversationId, msg: NewMessage) =>
    run((db) => {
      const c = find(db, visitorId, conversationId);
      if (!c) throw new Error("Conversation not found");
      const now = new Date().toISOString();
      const message: StoredMessage = {
        id: randomUUID(),
        role: msg.role,
        content: msg.content,
        ...(msg.sources && msg.sources.length ? { sources: msg.sources } : {}),
        ...(msg.attachments && msg.attachments.length ? { attachments: msg.attachments } : {}),
        createdAt: now,
      };
      c.messages.push(message);
      c.updatedAt = now;
      return message;
    }, true),

  listMemories: (visitorId) =>
    run((db) =>
      (db.memories ?? [])
        .filter((m) => m.visitorId === visitorId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map(({ key, value, updatedAt }) => ({ key, value, updatedAt })),
    ),

  setMemory: (visitorId, key, value) =>
    run((db) => {
      db.memories ??= [];
      const updatedAt = new Date().toISOString();
      const existing = db.memories.find((m) => m.visitorId === visitorId && m.key === key);
      if (existing) Object.assign(existing, { value, updatedAt });
      else db.memories.push({ visitorId, key, value, updatedAt });
      return { key, value, updatedAt };
    }, true),

  deleteMemory: (visitorId, key) =>
    run((db) => {
      const before = db.memories?.length ?? 0;
      db.memories = (db.memories ?? []).filter((m) => !(m.visitorId === visitorId && m.key === key));
      return db.memories.length < before;
    }, true),
};
