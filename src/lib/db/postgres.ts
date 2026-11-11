import postgres from "postgres";
import { randomUUID } from "node:crypto";
import type { Attachment, ConversationSummary, Memory, Source } from "@/lib/types";
import type { ChatStore, NewMessage, StoredMessage } from "./types";
import { SCHEMA_SQL } from "./schema";

type Sql = ReturnType<typeof postgres>;

const globalForPg = globalThis as unknown as { __rabeSql?: Sql; __rabeSchema?: Promise<void> };

function getSql(): Sql {
  if (!globalForPg.__rabeSql) {
    globalForPg.__rabeSql = postgres(process.env.DATABASE_URL!, {
      max: 5,
      idle_timeout: 20,
      connect_timeout: 15,
      // Works with poolers such as Neon / Supabase PgBouncer.
      prepare: false,
      onnotice: () => {},
    });
  }
  return globalForPg.__rabeSql;
}

async function ready(): Promise<Sql> {
  const sql = getSql();
  globalForPg.__rabeSchema ??= sql.unsafe(SCHEMA_SQL).then(() => undefined);
  try {
    await globalForPg.__rabeSchema;
  } catch (err) {
    globalForPg.__rabeSchema = undefined; // retry on next call
    throw err;
  }
  return sql;
}

interface ConvRow {
  id: string;
  title: string;
  created_at: Date;
  updated_at: Date;
}
interface MsgRow {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources: Source[] | null;
  attachments: Attachment[] | null;
  created_at: Date;
}
interface MemRow {
  key: string;
  value: string;
  updated_at: Date;
}

const toConv = (r: ConvRow): ConversationSummary => ({
  id: r.id,
  title: r.title,
  createdAt: new Date(r.created_at).toISOString(),
  updatedAt: new Date(r.updated_at).toISOString(),
});

const toMsg = (r: MsgRow): StoredMessage => ({
  id: r.id,
  role: r.role,
  content: r.content,
  ...(r.sources && r.sources.length ? { sources: r.sources } : {}),
  ...(r.attachments && r.attachments.length ? { attachments: r.attachments } : {}),
  createdAt: new Date(r.created_at).toISOString(),
});

const toMem = (r: MemRow): Memory => ({
  key: r.key,
  value: r.value,
  updatedAt: new Date(r.updated_at).toISOString(),
});

export const postgresStore: ChatStore = {
  kind: "postgres",

  async listConversations(visitorId) {
    const sql = await ready();
    const rows = await sql<ConvRow[]>`
      SELECT id, title, created_at, updated_at FROM conversations
      WHERE visitor_id = ${visitorId}
      ORDER BY updated_at DESC
      LIMIT 200`;
    return rows.map(toConv);
  },

  async getConversation(visitorId, id) {
    const sql = await ready();
    const rows = await sql<ConvRow[]>`
      SELECT id, title, created_at, updated_at FROM conversations
      WHERE id = ${id} AND visitor_id = ${visitorId}`;
    return rows[0] ? toConv(rows[0]) : null;
  },

  async getMessages(visitorId, conversationId, limit = 500) {
    const sql = await ready();
    const rows = await sql<MsgRow[]>`
      SELECT * FROM (
        SELECT m.id, m.role, m.content, m.sources, m.attachments, m.created_at
        FROM messages m
        JOIN conversations c ON c.id = m.conversation_id
        WHERE m.conversation_id = ${conversationId} AND c.visitor_id = ${visitorId}
        ORDER BY m.created_at DESC
        LIMIT ${limit}
      ) recent ORDER BY created_at ASC`;
    return rows.map(toMsg);
  },

  async createConversation(visitorId, title) {
    const sql = await ready();
    const rows = await sql<ConvRow[]>`
      INSERT INTO conversations (id, visitor_id, title)
      VALUES (${randomUUID()}, ${visitorId}, ${title})
      RETURNING id, title, created_at, updated_at`;
    return toConv(rows[0]);
  },

  async renameConversation(visitorId, id, title) {
    const sql = await ready();
    const rows = await sql<ConvRow[]>`
      UPDATE conversations SET title = ${title}
      WHERE id = ${id} AND visitor_id = ${visitorId}
      RETURNING id, title, created_at, updated_at`;
    return rows[0] ? toConv(rows[0]) : null;
  },

  async deleteConversation(visitorId, id) {
    const sql = await ready();
    const res = await sql`DELETE FROM conversations WHERE id = ${id} AND visitor_id = ${visitorId}`;
    return res.count > 0;
  },

  async clearConversations(visitorId) {
    const sql = await ready();
    const res = await sql`DELETE FROM conversations WHERE visitor_id = ${visitorId}`;
    return res.count;
  },

  async addMessage(visitorId, conversationId, msg: NewMessage) {
    const sql = await ready();
    const sources = msg.sources && msg.sources.length ? msg.sources : null;
    const attachments = msg.attachments && msg.attachments.length ? msg.attachments : null;
    const [row] = await sql.begin(async (tx) => {
      const owned = await tx`
        UPDATE conversations SET updated_at = now()
        WHERE id = ${conversationId} AND visitor_id = ${visitorId}
        RETURNING id`;
      if (owned.length === 0) throw new Error("Conversation not found");
      return tx<MsgRow[]>`
        INSERT INTO messages (id, conversation_id, role, content, sources, attachments)
        VALUES (${randomUUID()}, ${conversationId}, ${msg.role}, ${msg.content},
                ${sources ? tx.json(sources as unknown as postgres.JSONValue) : null},
                ${attachments ? tx.json(attachments as unknown as postgres.JSONValue) : null})
        RETURNING id, role, content, sources, attachments, created_at`;
    });
    return toMsg(row);
  },

  async listMemories(visitorId) {
    const sql = await ready();
    const rows = await sql<MemRow[]>`
      SELECT key, value, updated_at FROM memories
      WHERE visitor_id = ${visitorId}
      ORDER BY updated_at DESC
      LIMIT 200`;
    return rows.map(toMem);
  },

  async setMemory(visitorId, key, value) {
    const sql = await ready();
    const [row] = await sql<MemRow[]>`
      INSERT INTO memories (visitor_id, key, value, updated_at)
      VALUES (${visitorId}, ${key}, ${value}, now())
      ON CONFLICT (visitor_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
      RETURNING key, value, updated_at`;
    return toMem(row);
  },

  async deleteMemory(visitorId, key) {
    const sql = await ready();
    const res = await sql`DELETE FROM memories WHERE visitor_id = ${visitorId} AND key = ${key}`;
    return res.count > 0;
  },
};
