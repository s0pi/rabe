"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ConversationSummary, PublicConfig } from "@/lib/types";
import { Logo } from "./Logo";
import { ChatIcon, CloseIcon, PencilIcon, PlusIcon, SearchIcon, SettingsIcon, TrashIcon, UserIcon } from "./Icons";

interface Props {
  conversations: ConversationSummary[];
  loading: boolean;
  activeId: string | null;
  config: PublicConfig | null;
  onNew: () => void;
  onSelect: (id: string) => void;
  onDelete: (c: ConversationSummary) => void;
  onRename: (id: string, title: string) => void;
  onClearAll: () => void;
  onAbout: () => void;
  onSettings: () => void;
  onClose: () => void;
}

function groupLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return "Previous 7 days";
  if (diffDays < 30) return "Previous 30 days";
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function Sidebar(props: Props) {
  const { conversations, loading, activeId, config } = props;
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const editRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId) editRef.current?.select();
  }, [editingId]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? conversations.filter((c) => c.title.toLowerCase().includes(q)) : conversations;
    const out: { label: string; items: ConversationSummary[] }[] = [];
    for (const c of list) {
      const label = groupLabel(c.updatedAt);
      const g = out.find((x) => x.label === label);
      if (g) g.items.push(c);
      else out.push({ label, items: [c] });
    }
    return out;
  }, [conversations, query]);

  const commitRename = () => {
    if (editingId && draft.trim()) props.onRename(editingId, draft.trim());
    setEditingId(null);
  };

  return (
    <aside className="sidebar" aria-label="Chat history">
      <div className="brand">
        <Logo size={40} />
        <div className="brand-text">
          <span className="brand-name">RABÉ</span>
          <span className="brand-sub">The Argie Experience</span>
        </div>
        <button className="icon-btn sidebar-close" onClick={props.onClose} aria-label="Close menu">
          <CloseIcon />
        </button>
      </div>

      <button className="btn-new" onClick={props.onNew}>
        <PlusIcon width={18} height={18} /> New chat
        <kbd>Ctrl ⇧ O</kbd>
      </button>

      <div className="search">
        <SearchIcon />
        <input
          type="search"
          placeholder="Search chats"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search chats"
        />
      </div>

      <nav className="history">
        {loading ? (
          <div style={{ display: "grid", gap: 8, padding: "6px 4px" }}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton" style={{ height: 34, opacity: 1 - i * 0.2 }} />
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <div className="history-empty">
            <strong>No chats yet</strong>
            Your chats with Bro will show up here.
          </div>
        ) : groups.length === 0 ? (
          <div className="history-empty">No chats match “{query}”.</div>
        ) : (
          groups.map((g) => (
            <div className="history-group" key={g.label}>
              <div className="history-label">{g.label}</div>
              {g.items.map((c) => (
                <div key={c.id} className={`chat-item ${c.id === activeId ? "active" : ""}`}>
                  {editingId === c.id ? (
                    <input
                      ref={editRef}
                      className="chat-rename"
                      value={draft}
                      maxLength={80}
                      onChange={(e) => setDraft(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename();
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      aria-label="Rename chat"
                    />
                  ) : (
                    <>
                      <button
                        className="chat-link"
                        onClick={() => props.onSelect(c.id)}
                        aria-current={c.id === activeId ? "page" : undefined}
                        title={c.title}
                      >
                        <ChatIcon />
                        <span className="chat-title">{c.title}</span>
                      </button>
                      <div className="chat-actions">
                        <button
                          className="icon-btn"
                          aria-label={`Rename “${c.title}”`}
                          title="Rename"
                          onClick={() => {
                            setDraft(c.title);
                            setEditingId(c.id);
                          }}
                        >
                          <PencilIcon />
                        </button>
                        <button
                          className="icon-btn danger"
                          aria-label={`Delete “${c.title}”`}
                          title="Delete"
                          onClick={() => props.onDelete(c)}
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          ))
        )}
      </nav>

      <div className="sidebar-footer">
        <button className="side-btn" onClick={props.onAbout}>
          <UserIcon /> About Rabe
        </button>
        <button className="side-btn" onClick={props.onSettings}>
          <SettingsIcon /> Settings
        </button>
        <button className="side-btn danger" onClick={props.onClearAll} disabled={conversations.length === 0}>
          <TrashIcon /> Clear chat history
        </button>
        {config && (
          <div className="side-meta" title={config.configured ? "AI connected" : "AI key not configured"}>
            <span className={`dot ${config.configured ? "" : "off"}`} />
            <span>{config.configured ? config.model : "AI not configured"}</span>
          </div>
        )}
      </div>
    </aside>
  );
}
