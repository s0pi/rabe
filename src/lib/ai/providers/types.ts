import type { Role, Source } from "@/lib/types";

export interface HistoryMessage {
  role: Role;
  content: string;
}

export interface GenerateCallbacks {
  onText: (delta: string) => void;
  onStatus: (status: "thinking" | "searching" | "reading" | "writing" | "waiting", detail?: string) => void;
  onSources: (sources: Source[]) => void;
}

export interface GenerateInput {
  /** Full conversation so far, ending with the newest user message. */
  messages: HistoryMessage[];
  signal: AbortSignal;
  /** Extra per-request context for the system prompt (e.g. Bro's memory). */
  context?: string;
}

export interface GenerateResult {
  text: string;
  sources: Source[];
}

/** An error whose message is safe and friendly to show to the user. */
export class UserFacingError extends Error {
  constructor(
    message: string,
    public status = 500,
  ) {
    super(message);
  }
}
