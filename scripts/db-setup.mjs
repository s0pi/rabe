// Creates the RABÉ tables in your Postgres database.
// Usage:  DATABASE_URL=postgres://... npm run db:setup
// (Optional — the app also creates them automatically on first use.)
import postgres from "postgres";
import { readFileSync, existsSync } from "node:fs";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*DATABASE_URL\s*=\s*(.+)\s*$/);
    if (m) process.env.DATABASE_URL = m[1].replace(/^["']|["']$/g, "");
  }
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set (env or .env.local).");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
const schema = readFileSync(new URL("../src/lib/db/schema.ts", import.meta.url), "utf8")
  .match(/`([\s\S]*)`/)[1];

try {
  await sql.unsafe(schema);
  const [{ count }] = await sql`SELECT count(*)::int AS count FROM conversations`;
  console.log(`✔ Database ready. conversations: ${count}`);
} catch (err) {
  console.error("✖ Setup failed:", err.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
