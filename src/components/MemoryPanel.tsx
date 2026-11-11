"use client";

import { useCallback, useEffect, useState } from "react";
import type { Memory } from "@/lib/types";
import { CheckIcon, CloseIcon, PencilIcon, PlusIcon, TrashIcon } from "./Icons";

const pretty = (key: string) => key.replace(/_/g, " ");

/** Everything Bro remembers about Rabe — view, edit, add, forget. */
export function MemoryPanel() {
  const [memories, setMemories] = useState<Memory[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null); // key being edited, or "__new"
  const [draftKey, setDraftKey] = useState("");
  const [draftValue, setDraftValue] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/memories");
      const data = (await res.json()) as { memories?: Memory[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Couldn't load memory.");
      setMemories(data.memories ?? []);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const startEdit = (m?: Memory) => {
    setError(null);
    setEditing(m ? m.key : "__new");
    setDraftKey(m ? pretty(m.key) : "");
    setDraftValue(m?.value ?? "");
  };

  const save = async () => {
    try {
      const res = await fetch("/api/memories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: draftKey, value: draftValue, oldKey: editing !== "__new" ? editing : undefined }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Couldn't save.");
      setEditing(null);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const forget = async (key: string) => {
    setMemories((list) => list?.filter((m) => m.key !== key) ?? null);
    await fetch(`/api/memories?key=${encodeURIComponent(key)}`, { method: "DELETE" }).catch(() => {});
  };

  const editor = (
    <div className="mem-edit">
      <input
        value={draftKey}
        onChange={(e) => setDraftKey(e.target.value)}
        placeholder="e.g. favorite food"
        aria-label="What it is"
        maxLength={40}
        autoFocus={editing === "__new"}
      />
      <input
        value={draftValue}
        onChange={(e) => setDraftValue(e.target.value)}
        placeholder="e.g. sinigang"
        aria-label="Value"
        maxLength={300}
        autoFocus={editing !== "__new"}
        onKeyDown={(e) => {
          if (e.key === "Enter") void save();
          if (e.key === "Escape") setEditing(null);
        }}
      />
      <button className="icon-btn" onClick={() => void save()} aria-label="Save" title="Save">
        <CheckIcon />
      </button>
      <button className="icon-btn" onClick={() => setEditing(null)} aria-label="Cancel" title="Cancel">
        <CloseIcon />
      </button>
    </div>
  );

  return (
    <section className="memory-panel" aria-label="What Bro remembers">
      <div className="about-gallery-head">
        <h4>
          <span aria-hidden="true">🧠</span> What Bro remembers about you
        </h4>
        {editing !== "__new" && (
          <button className="pill-btn" onClick={() => startEdit()}>
            <PlusIcon /> Add
          </button>
        )}
      </div>
      <p className="mem-hint">
        Bro learns automatically when you tell him things in chat (like your birthday). You can also fix or delete anything here.
      </p>
      {error && <p className="mem-error">{error}</p>}
      {editing === "__new" && editor}
      {memories === null ? (
        <div className="skeleton" style={{ height: 60 }} />
      ) : memories.length === 0 && editing !== "__new" ? (
        <div className="mem-empty">Nothing yet. Tell Bro about yourself, e.g. “My birthday is March 7, 2004.”</div>
      ) : (
        <ul className="mem-list">
          {memories.map((m) =>
            editing === m.key ? (
              <li key={m.key}>{editor}</li>
            ) : (
              <li key={m.key} className="mem-item">
                <span className="mem-key">{pretty(m.key)}</span>
                <span className="mem-value">{m.value}</span>
                <span className="mem-actions">
                  <button className="icon-btn" onClick={() => startEdit(m)} aria-label={`Edit ${pretty(m.key)}`} title="Edit">
                    <PencilIcon />
                  </button>
                  <button className="icon-btn danger" onClick={() => void forget(m.key)} aria-label={`Forget ${pretty(m.key)}`} title="Forget">
                    <TrashIcon />
                  </button>
                </span>
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  );
}
