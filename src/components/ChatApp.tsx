"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type {
  Attachment,
  ChatStreamEvent,
  ConversationSummary,
  ConversationWithMessages,
  PublicConfig,
} from "@/lib/types";
import { useSettings } from "@/hooks/useSettings";
import { Sidebar } from "./Sidebar";
import { WelcomeScreen } from "./WelcomeScreen";
import { MessageBubble, type UIMessage } from "./MessageBubble";
import { Composer, type ComposerHandle } from "./Composer";
import { AboutArgie } from "./AboutArgie";
import { SettingsModal } from "./SettingsModal";
import { ConfirmDialog } from "./Modal";
import { Toasts, type Toast } from "./Toasts";
import type { FaceMood } from "./FloatingFace";
import { PhotoViewer } from "./PhotoViewer";
import { Logo } from "./Logo";
import { AlertIcon, ArrowDownIcon, GlobeIcon, MenuIcon, PlusIcon, SparklesIcon } from "./Icons";

type Confirm = { title: string; message: React.ReactNode; confirmLabel: string; action: () => void };

let tmpCounter = 0;
const tmpId = (p: string) => `${p}-${Date.now()}-${++tmpCounter}`;

function readConversationFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get("c");
}

function writeUrl(id: string | null, mode: "push" | "replace" = "push") {
  const url = id ? `/?c=${encodeURIComponent(id)}` : "/";
  if (window.location.pathname + window.location.search === url) return;
  window.history[mode === "push" ? "pushState" : "replaceState"]({ c: id }, "", url);
}

/** Session expired or app locked elsewhere: go to the passcode screen. */
function goToLock() {
  const next = window.location.pathname + window.location.search;
  window.location.href = `/login${next && next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`;
}

async function api<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  if (res.status === 401) goToLock();
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { status: res.status });
  return data;
}

export function ChatApp() {
  const { settings, update } = useSettings();

  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [modal, setModal] = useState<"about" | "settings" | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [atBottom, setAtBottom] = useState(true);
  const [happy, setHappy] = useState(false);
  const [faceSay, setFaceSay] = useState<string | null>(null);
  const happyTimer = useRef<number | null>(null);

  /** Floating face: a little celebration when Bro finishes. */
  const celebrate = useCallback(() => {
    setHappy(true);
    if (happyTimer.current) window.clearTimeout(happyTimer.current);
    happyTimer.current = window.setTimeout(() => setHappy(false), 1800);
  }, []);
  const sayFace = useCallback((text: string) => {
    // A new object each time so repeated lines still show.
    setFaceSay(null);
    requestAnimationFrame(() => setFaceSay(text));
  }, []);

  const activeIdRef = useRef<string | null>(null);
  const busyRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const loadTokenRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const composerRef = useRef<ComposerHandle>(null);
  const pendingText = useRef("");
  const rafRef = useRef<number | null>(null);
  const streamingIdRef = useRef<string | null>(null);

  const setActive = useCallback((id: string | null) => {
    activeIdRef.current = id;
    setActiveId(id);
  }, []);

  const toast = useCallback((text: string, kind: Toast["kind"] = "error") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  /* ── Loading ─────────────────────────────────────────────── */

  const refreshList = useCallback(async () => {
    try {
      const { conversations } = await api<{ conversations: ConversationSummary[] }>("/api/conversations");
      setConversations(conversations);
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setListLoading(false);
    }
  }, [toast]);

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const loadConversation = useCallback(
    async (id: string) => {
      const token = ++loadTokenRef.current;
      setActive(id);
      setMessages([]);
      setThreadLoading(true);
      try {
        const { conversation } = await api<{ conversation: ConversationWithMessages }>(
          `/api/conversations/${encodeURIComponent(id)}`,
        );
        if (token !== loadTokenRef.current) return;
        stickRef.current = true;
        setMessages(
          conversation.messages.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            sources: m.sources,
            attachments: m.attachments,
            state: "done",
          })),
        );
      } catch (err) {
        if (token !== loadTokenRef.current) return;
        toast((err as { status?: number }).status === 404 ? "That chat no longer exists." : (err as Error).message);
        setActive(null);
        writeUrl(null, "replace");
      } finally {
        if (token === loadTokenRef.current) setThreadLoading(false);
      }
    },
    [setActive, toast],
  );

  useEffect(() => {
    api<PublicConfig>("/api/config").then(setConfig).catch(() => setConfig(null));
    // Load the list first so the visitor cookie exists before other calls.
    refreshList().then(() => {
      const fromUrl = readConversationFromUrl();
      if (fromUrl) void loadConversation(fromUrl);
    });

    const onPop = () => {
      abortRef.current?.abort();
      const id = readConversationFromUrl();
      if (id) void loadConversation(id);
      else {
        loadTokenRef.current++;
        setActive(null);
        setMessages([]);
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Navigation ──────────────────────────────────────────── */

  const newChat = useCallback(() => {
    stopStreaming();
    loadTokenRef.current++;
    setActive(null);
    setMessages([]);
    setThreadLoading(false);
    setDrawerOpen(false);
    writeUrl(null);
    requestAnimationFrame(() => composerRef.current?.focus());
  }, [setActive, stopStreaming]);

  const selectConversation = useCallback(
    (id: string) => {
      setDrawerOpen(false);
      if (id === activeIdRef.current) return;
      stopStreaming();
      writeUrl(id);
      void loadConversation(id);
    },
    [loadConversation, stopStreaming],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        newChat();
      } else if (e.key === "Escape" && drawerOpen) {
        setDrawerOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [newChat, drawerOpen]);

  /* ── Streaming ───────────────────────────────────────────── */

  const patchStreaming = useCallback((fn: (m: UIMessage) => UIMessage) => {
    const id = streamingIdRef.current;
    if (!id) return;
    setMessages((prev) => prev.map((m) => (m.id === id ? fn(m) : m)));
  }, []);

  const flushText = useCallback(() => {
    rafRef.current = null;
    const chunk = pendingText.current;
    if (!chunk) return;
    pendingText.current = "";
    patchStreaming((m) => ({ ...m, content: m.content + chunk }));
  }, [patchStreaming]);

  const sendMessage = useCallback(
    async (text: string, attachments: Attachment[] = [], opts: { retry?: boolean } = {}) => {
      const content = text.trim();
      if ((!content && !attachments.length) || busyRef.current) return;

      busyRef.current = true;
      setBusy(true);
      stickRef.current = true;

      const aiId = tmpId("ai");
      streamingIdRef.current = aiId;
      const aiMsg: UIMessage = { id: aiId, role: "assistant", content: "", state: "streaming", status: { status: "thinking" } };
      setMessages((prev) =>
        opts.retry
          ? [...prev.filter((m) => m.state !== "error"), aiMsg]
          : [
              ...prev,
              {
                id: tmpId("user"),
                role: "user",
                content,
                state: "done",
                ...(attachments.length ? { attachments: attachments.map(({ text: _text, ...meta }) => meta) } : {}),
              },
              aiMsg,
            ],
      );

      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const startedIn = activeIdRef.current;
      let finished = false;

      const handle = (ev: ChatStreamEvent) => {
        switch (ev.type) {
          case "meta": {
            const conv = ev.conversation;
            if (!startedIn && activeIdRef.current === null) {
              setActive(conv.id);
              writeUrl(conv.id);
            }
            setConversations((list) => [conv, ...list.filter((c) => c.id !== conv.id)]);
            break;
          }
          case "text":
            pendingText.current += ev.delta;
            rafRef.current ??= requestAnimationFrame(flushText);
            break;
          case "status":
            patchStreaming((m) => ({ ...m, status: { status: ev.status, detail: ev.detail } }));
            break;
          case "sources":
            patchStreaming((m) => ({ ...m, sources: ev.sources }));
            break;
          case "memory":
            patchStreaming((m) => ({ ...m, memory: [...(m.memory ?? []), ...ev.changes] }));
            sayFace(ev.changes.some((c) => c.value !== null) ? "Noted! 🧠" : "Forgotten 🫡");
            break;
          case "done":
            finished = true;
            flushText();
            patchStreaming((m) => ({ ...m, id: ev.messageId ?? m.id, state: "done", status: undefined }));
            celebrate();
            break;
          case "error":
            finished = true;
            flushText();
            patchStreaming((m) => ({ ...m, state: "error", error: ev.message, status: undefined }));
            break;
        }
      };

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId: startedIn,
            message: content,
            attachments: opts.retry ? [] : attachments,
            retry: opts.retry ?? false,
          }),
          signal: ctrl.signal,
        });
        if (res.status === 401) goToLock();
        if (!res.ok || !res.body) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error || `Request failed (${res.status})`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (line) {
              try {
                handle(JSON.parse(line) as ChatStreamEvent);
              } catch {
                // skip malformed line
              }
            }
          }
        }
        if (!finished) {
          flushText();
          patchStreaming((m) =>
            m.content
              ? { ...m, state: "done", status: undefined }
              : { ...m, state: "error", error: "The reply was cut off. Please try again.", status: undefined },
          );
        }
      } catch (err) {
        flushText();
        if (ctrl.signal.aborted) {
          patchStreaming((m) => ({
            ...m,
            state: "done",
            status: undefined,
            content: m.content || "_Okay, stopped. Ready when you are._",
          }));
        } else {
          const message = (err as Error).message || "Network error. Check your connection.";
          patchStreaming((m) => ({ ...m, state: "error", error: message, status: undefined }));
        }
      } finally {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
        pendingText.current = "";
        streamingIdRef.current = null;
        abortRef.current = null;
        busyRef.current = false;
        setBusy(false);
      }
    },
    [flushText, patchStreaming, setActive, sayFace, celebrate],
  );

  const retryLast = useCallback(() => {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (lastUser) void sendMessage(lastUser.content, [], { retry: true });
  }, [messages, sendMessage]);

  /* ── Conversation actions ────────────────────────────────── */

  const askDelete = (c: ConversationSummary) =>
    setConfirm({
      title: "Delete chat?",
      message: (
        <>
          This will permanently delete <strong>“{c.title}”</strong>.
        </>
      ),
      confirmLabel: "Delete",
      action: async () => {
        try {
          await api(`/api/conversations/${encodeURIComponent(c.id)}`, { method: "DELETE" });
          setConversations((list) => list.filter((x) => x.id !== c.id));
          if (activeIdRef.current === c.id) newChat();
          toast("Chat deleted.", "success");
        } catch (err) {
          toast((err as Error).message);
        }
      },
    });

  const askClearAll = () =>
    setConfirm({
      title: "Clear all chats?",
      message: "This permanently deletes every conversation in your history. Can't undo this one, pre.",
      confirmLabel: "Clear everything",
      action: async () => {
        try {
          await api("/api/conversations", { method: "DELETE" });
          setConversations([]);
          newChat();
          setModal(null);
          toast("Chat history cleared.", "success");
        } catch (err) {
          toast((err as Error).message);
        }
      },
    });

  const rename = async (id: string, title: string) => {
    const before = conversations;
    setConversations((list) => list.map((c) => (c.id === id ? { ...c, title } : c)));
    try {
      await api(`/api/conversations/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ title }) });
    } catch (err) {
      setConversations(before);
      toast((err as Error).message);
    }
  };

  /* ── Scrolling ───────────────────────────────────────────── */

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
    stickRef.current = near;
    setAtBottom(near);
  };

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const jumpToBottom = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickRef.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  };

  /* ── Render ──────────────────────────────────────────────── */

  const activeTitle = conversations.find((c) => c.id === activeId)?.title;
  const showWelcome = !activeId && messages.length === 0 && !threadLoading;
  const lastIndex = messages.length - 1;
  const streamingMsg = busy ? messages.find((m) => m.state === "streaming") : undefined;
  const faceMood: FaceMood = streamingMsg
    ? streamingMsg.content
      ? "talking"
      : streamingMsg.status?.status === "searching"
        ? "searching"
        : streamingMsg.status?.status === "reading"
          ? "reading"
          : streamingMsg.status?.status === "waiting"
            ? "waiting"
            : "thinking"
    : happy
      ? "happy"
      : "idle";

  return (
    <>
      <div className="aurora" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>

      <div className={`app ${drawerOpen ? "drawer-open" : ""}`}>
        <Sidebar
          conversations={conversations}
          loading={listLoading}
          activeId={activeId}
          config={config}
          onNew={newChat}
          onSelect={selectConversation}
          onDelete={askDelete}
          onRename={rename}
          onClearAll={askClearAll}
          onAbout={() => {
            setDrawerOpen(false);
            setModal("about");
          }}
          onSettings={() => {
            setDrawerOpen(false);
            setModal("settings");
          }}
          onClose={() => setDrawerOpen(false)}
        />
        <div className="scrim" onClick={() => setDrawerOpen(false)} />

        <main
          className="main"
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes("Files")) e.preventDefault();
          }}
          onDrop={(e) => {
            if (!e.dataTransfer.files.length) return;
            e.preventDefault();
            composerRef.current?.addFiles(e.dataTransfer.files);
          }}
        >
          <header className="topbar">
            <button className="icon-btn lg" onClick={() => setDrawerOpen(true)} aria-label="Open menu">
              <MenuIcon />
            </button>
            <div className="brand">
              <Logo size={30} />
              <span className="brand-name">RABÉ</span>
            </div>
            <button className="icon-btn lg" onClick={newChat} aria-label="New chat">
              <PlusIcon />
            </button>
          </header>

          <div className="chat-header">
            <h1>{activeTitle ?? (activeId ? "" : "New chat")}</h1>
            {config && (
              <span className="model-pill" title={`${config.provider} · ${config.model}`}>
                {config.webSearch ? <GlobeIcon /> : <SparklesIcon />}
                {config.webSearch ? "Web-connected AI" : "AI"} · {config.model}
              </span>
            )}
          </div>

          {config && !config.configured && (
            <div className="banner">
              <div>
                <AlertIcon width={18} height={18} style={{ flex: "none", marginTop: 2 }} />
                <span>
                  The AI isn&apos;t connected yet. Get a free key at{" "}
                  <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer">
                    console.groq.com/keys
                  </a>{" "}
                  and put it in <code>.env.local</code> as <code>GROQ_API_KEY=…</code>, then refresh.
                </span>
              </div>
            </div>
          )}

          <div className="scroll" ref={scrollRef} onScroll={onScroll}>
            {showWelcome ? (
              <WelcomeScreen onPick={(t) => void sendMessage(t)} disabled={busy} />
            ) : (
              <div className="thread" aria-live="polite">
                {threadLoading &&
                  [0, 1, 2].map((i) => (
                    <div key={i} className="skeleton" style={{ height: i % 2 ? 54 : 110, width: i % 2 ? "45%" : "80%", alignSelf: i % 2 ? "flex-end" : "flex-start" }} />
                  ))}
                {messages.map((m, i) => (
                  <MessageBubble
                    key={m.id}
                    message={m}
                    showSources={settings.showSources}
                    onRetry={i === lastIndex && m.state === "error" && !busy ? retryLast : undefined}
                  />
                ))}
              </div>
            )}
          </div>

          {!atBottom && !showWelcome && messages.length > 0 && (
            <button className="jump glass" onClick={jumpToBottom}>
              <ArrowDownIcon /> Latest
            </button>
          )}

          <Composer
            ref={composerRef}
            busy={busy}
            disabled={threadLoading}
            enterToSend={settings.enterToSend}
            onSend={(t, a) => void sendMessage(t, a)}
            mood={faceMood}
            faceSay={faceSay}
            onStop={stopStreaming}
          />
        </main>
      </div>

      {modal === "about" && (
        <AboutArgie
          onClose={() => setModal(null)}
          onAsk={(q) => {
            setModal(null);
            if (activeIdRef.current) newChat();
            setTimeout(() => void sendMessage(q), 0);
          }}
        />
      )}
      {modal === "settings" && (
        <SettingsModal
          settings={settings}
          update={update}
          config={config}
          hasChats={conversations.length > 0}
          onClearAll={askClearAll}
          onLock={async () => {
            stopStreaming();
            await fetch("/api/auth", { method: "DELETE" }).catch(() => {});
            window.location.href = "/login";
          }}
          onClose={() => setModal(null)}
        />
      )}
      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const action = confirm.action;
            setConfirm(null);
            action();
          }}
        />
      )}
      <Toasts toasts={toasts} />
      <PhotoViewer />
    </>
  );
}
