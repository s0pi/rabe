"use client";

import { memo, useEffect, useState } from "react";
import type { AttachmentMeta, MemoryChange, Source } from "@/lib/types";
import { FileBadge } from "./Composer";
import { openPhotoViewer } from "./PhotoViewer";
import { Logo } from "./Logo";
import { Markdown } from "./Markdown";
import {
  AlertIcon,
  BrainIcon,
  CheckIcon,
  CopyIcon,
  GlobeIcon,
  LinkIcon,
  RefreshIcon,
  SearchIcon,
} from "./Icons";

export type StreamStatus = { status: "thinking" | "searching" | "reading" | "writing" | "waiting"; detail?: string };

export interface UIMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  attachments?: AttachmentMeta[];
  memory?: MemoryChange[];
  state?: "streaming" | "error" | "done";
  error?: string;
  status?: StreamStatus;
}

const THINKING_LINES = [
  "Thinking handsomely…",
  "Fixing my hair, wait lang…",
  "Loading wit.exe…",
  "Consulting my good looks…",
  "Brewing a smart answer…",
  "Hmm, let me cook…",
];

function useRotating(lines: string[], active: boolean, ms = 2200) {
  const [i, setI] = useState(() => Math.floor(Math.random() * lines.length));
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setI((n) => (n + 1) % lines.length), ms);
    return () => clearInterval(t);
  }, [active, lines.length, ms]);
  return lines[i];
}

function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function StatusLine({ status, inline }: { status: StreamStatus; inline?: boolean }) {
  const thinking = useRotating(THINKING_LINES, status.status === "thinking" || status.status === "writing");
  let icon = <BrainIcon />;
  let label = thinking;
  if (status.status === "searching") {
    icon = <SearchIcon className="spin" style={{ animationDuration: "2.4s" }} />;
    label = status.detail ? `Searching the web: “${status.detail}”` : "Searching the web…";
  } else if (status.status === "reading") {
    icon = <GlobeIcon className="spin" style={{ animationDuration: "3s" }} />;
    label = status.detail ? `Reading ${status.detail}…` : "Reading a page…";
  } else if (status.status === "waiting") {
    label = `Catching my breath (free AI limit), back in ${status.detail ?? "a few seconds"}…`;
  }
  return (
    <div className={`status ${inline ? "inline" : ""}`} aria-live="polite">
      {inline ? icon : <span className="typing" aria-hidden="true"><i /><i /><i /></span>}
      <span className="status-text" key={label}>{label}</span>
      {!inline && status.status !== "thinking" && status.status !== "writing" && icon}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="icon-btn"
      aria-label={copied ? "Copied" : "Copy message"}
      title={copied ? "Copied!" : "Copy"}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // clipboard blocked
        }
      }}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  );
}

function prettyKey(key: string) {
  return key.replace(/_/g, " ");
}

function prettyValue(key: string, value: string) {
  // Show stored dates nicely: 2004-03-07 -> March 7, 2004
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) ?? /^()(\d{2})-(\d{2})$/.exec(value);
  if (m && /birth|date|day/.test(key)) {
    const month = new Date(Date.UTC(2000, Number(m[2]) - 1, 1)).toLocaleString("en-US", { month: "long", timeZone: "UTC" });
    return `${month} ${Number(m[3])}${m[1] ? `, ${m[1]}` : ""}`;
  }
  return value;
}

function MemoryChip({ changes }: { changes: MemoryChange[] }) {
  return (
    <div className="memory-chip" role="status">
      <span aria-hidden="true">🧠</span>
      {changes.map((c, i) => (
        <span key={c.key}>
          {i > 0 && " · "}
          {c.value === null ? (
            <>
              Forgot <s>{prettyKey(c.key)}</s>
            </>
          ) : (
            <>
              {c.previous ? "Updated" : "Remembered"} {prettyKey(c.key)}: <b>{prettyValue(c.key, c.value)}</b>
              {c.previous ? (
                <>
                  {" "}
                  <s>{prettyValue(c.key, c.previous)}</s>
                </>
              ) : null}
            </>
          )}
        </span>
      ))}
    </div>
  );
}

function SentFiles({ files }: { files: AttachmentMeta[] }) {
  const photos = files.filter((f) => f.kind === "image" && f.preview);
  return (
    <div className="msg-files">
      {files.map((f) =>
        f.kind === "image" && f.preview ? (
          <button
            key={f.id}
            type="button"
            className="msg-photo"
            onClick={() =>
              openPhotoViewer(
                photos.map((p) => ({ src: p.preview!, caption: p.name })),
                photos.indexOf(f),
              )
            }
            aria-label={`View ${f.name}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={f.preview} alt={f.name} />
          </button>
        ) : (
          <div key={f.id} className="msg-file" title={f.note ?? f.name}>
            <FileBadge kind={f.kind} />
            <span style={{ minWidth: 0, display: "flex", flexDirection: "column" }}>
              <span className="msg-file-name">{f.name}</span>
              <span className="msg-file-meta">
                {f.pages ? `${f.pages} ${f.kind === "pptx" ? "slides" : "pages"} · ` : ""}
                {(f.size / 1024 / 1024).toFixed(f.size > 1024 * 1024 ? 1 : 2)} MB
              </span>
            </span>
          </div>
        ),
      )}
    </div>
  );
}

interface Props {
  message: UIMessage;
  showSources: boolean;
  onRetry?: () => void;
}

export const MessageBubble = memo(function MessageBubble({ message, showSources, onRetry }: Props) {
  if (message.role === "user") {
    return (
      <div className="msg user">
        <div className="msg-body">
          {message.attachments && message.attachments.length > 0 && <SentFiles files={message.attachments} />}
          {message.content && <div className="bubble-user">{message.content}</div>}
          <div className="msg-actions">
            <CopyButton text={message.content} />
          </div>
        </div>
      </div>
    );
  }

  const streaming = message.state === "streaming";
  const hasText = message.content.length > 0;
  const toolBusy =
    streaming && hasText && (message.status?.status === "searching" || message.status?.status === "reading");

  return (
    <div className={`msg ai ${streaming ? "streaming" : ""}`}>
      <Logo size={32} className="ai-avatar" />
      <div className="msg-body">
        <div className="ai-name">Bro</div>

        {streaming && !hasText ? (
          <StatusLine status={message.status ?? { status: "thinking" }} />
        ) : (
          hasText && (
            <div className="bubble-ai">
              <Markdown text={message.content} />
            </div>
          )
        )}

        {toolBusy && message.status && <StatusLine status={message.status} inline />}

        {message.state === "error" && (
          <div className="bubble-ai error">
            <div className="error-row">
              <AlertIcon />
              <span>{message.error ?? "Something went wrong."}</span>
            </div>
            {onRetry && (
              <div style={{ marginTop: 10 }}>
                <button className="pill-btn" onClick={onRetry}>
                  <RefreshIcon /> Try again
                </button>
              </div>
            )}
          </div>
        )}

        {message.memory && message.memory.length > 0 && <MemoryChip changes={message.memory} />}

        {showSources && message.sources && message.sources.length > 0 && (
          <div className="sources" aria-label="Sources">
            {message.sources.map((s) => (
              <a key={s.url} className="source" href={s.url} target="_blank" rel="noopener noreferrer" title={s.title}>
                <LinkIcon />
                <span>{s.title || hostname(s.url)}</span>
              </a>
            ))}
          </div>
        )}

        {!streaming && hasText && (
          <div className="msg-actions">
            <CopyButton text={message.content} />
          </div>
        )}
      </div>
    </div>
  );
});
