import type { ChatStore } from "./types";
import { postgresStore } from "./postgres";
import { fileStore } from "./file";

let warned = false;

/** Postgres when DATABASE_URL is set, otherwise a local JSON file (dev). */
export function getStore(): ChatStore {
  if (process.env.DATABASE_URL) return postgresStore;
  if (!warned && process.env.NODE_ENV === "production") {
    warned = true;
    console.warn(
      "[rabe] DATABASE_URL is not set — using a temporary local file. Chat history will NOT persist on serverless hosts.",
    );
  }
  return fileStore;
}

export type { ChatStore } from "./types";
