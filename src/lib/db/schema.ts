/** Postgres schema. Applied automatically on first use (idempotent, safe to re-run). */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS conversations (
  id          TEXT PRIMARY KEY,
  visitor_id  TEXT NOT NULL,
  title       TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS conversations_visitor_updated_idx
  ON conversations (visitor_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id               TEXT PRIMARY KEY,
  conversation_id  TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role             TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content          TEXT NOT NULL,
  sources          JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS messages_conversation_created_idx
  ON messages (conversation_id, created_at);

-- Files Rabe attached (with the text Bro read from them).
ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachments JSONB;

-- Bro's long-term memory about Rabe.
CREATE TABLE IF NOT EXISTS memories (
  visitor_id  TEXT NOT NULL,
  key         TEXT NOT NULL,
  value       TEXT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (visitor_id, key)
);
`;
