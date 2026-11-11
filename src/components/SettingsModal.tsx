"use client";

import type { PublicConfig } from "@/lib/types";
import { THEMES, type Settings } from "@/hooks/useSettings";
import { Modal } from "./Modal";
import { SettingsIcon, TrashIcon } from "./Icons";

const LockIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="switch"
      onClick={() => onChange(!checked)}
    />
  );
}

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  config: PublicConfig | null;
  hasChats: boolean;
  onClearAll: () => void;
  onLock: () => void;
  onClose: () => void;
}

export function SettingsModal({ settings, update, config, hasChats, onClearAll, onLock, onClose }: Props) {
  return (
    <Modal
      title="Settings"
      icon={<SettingsIcon width={20} height={20} color="var(--lavender)" />}
      onClose={onClose}
      footer={
        <button className="btn btn-primary" onClick={onClose}>
          Done
        </button>
      }
    >
      <div className="setting-group">
        <h3>Chat</h3>
        <div className="setting">
          <div className="setting-label">
            <strong>Enter to send</strong>
            <span>Off: Enter adds a new line, Ctrl + Enter sends</span>
          </div>
          <Switch label="Enter to send" checked={settings.enterToSend} onChange={(v) => update({ enterToSend: v })} />
        </div>
        <div className="setting">
          <div className="setting-label">
            <strong>Show web sources</strong>
            <span>Links Bro used when it searched the web</span>
          </div>
          <Switch label="Show web sources" checked={settings.showSources} onChange={(v) => update({ showSources: v })} />
        </div>
      </div>

      <div className="setting-group">
        <h3>Theme</h3>
        <div className="theme-grid" role="radiogroup" aria-label="Theme">
          {THEMES.map((t) => (
            <button
              key={t.id}
              role="radio"
              aria-checked={settings.theme === t.id}
              className={`theme-card ${settings.theme === t.id ? "active" : ""}`}
              onClick={() => update({ theme: t.id })}
            >
              <span
                className="theme-preview"
                style={{ background: `radial-gradient(120% 90% at 100% 0%, ${t.swatch[2]}55, transparent 60%), ${t.swatch[0]}` }}
                aria-hidden="true"
              >
                <span style={{ background: `linear-gradient(135deg, ${t.swatch[1]}, ${t.swatch[2]})` }} />
                <span style={{ background: t.id === "daylight" ? "#ffffff" : "rgba(255,255,255,0.12)" }} />
              </span>
              <span className="theme-name">{t.name}</span>
              <span className="theme-desc">{t.desc}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="setting-group">
        <h3>Appearance</h3>
        <div className="setting">
          <div className="setting-label">
            <strong>Text size</strong>
            <span>Make messages easier to read</span>
          </div>
          <div className="segmented" role="group" aria-label="Text size">
            {(["sm", "md", "lg"] as const).map((s) => (
              <button key={s} aria-pressed={settings.textSize === s} onClick={() => update({ textSize: s })}>
                {s === "sm" ? "Small" : s === "md" ? "Default" : "Large"}
              </button>
            ))}
          </div>
        </div>
        <div className="setting">
          <div className="setting-label">
            <strong>Reduce motion</strong>
            <span>Turn off animations and glow effects</span>
          </div>
          <Switch label="Reduce motion" checked={settings.reduceMotion} onChange={(v) => update({ reduceMotion: v })} />
        </div>
      </div>

      <div className="setting-group">
        <h3>AI engine</h3>
        <div className="setting" style={{ display: "block" }}>
          {config ? (
            <dl className="info-grid">
              <dt>Status</dt>
              <dd style={{ color: config.configured ? "var(--success)" : "var(--danger)" }}>
                {config.configured ? "Connected" : "Not configured (set an API key on the server)"}
              </dd>
              <dt>Provider</dt>
              <dd>{config.provider}</dd>
              <dt>Model</dt>
              <dd>{config.model}</dd>
              <dt>Web search</dt>
              <dd>{config.webSearch ? "On" : "Off"}</dd>
              <dt>Storage</dt>
              <dd>{config.storage === "postgres" ? "Postgres database" : "Local file (dev mode)"}</dd>
            </dl>
          ) : (
            <div className="skeleton" style={{ height: 100 }} />
          )}
        </div>
      </div>

      {config?.locked && (
        <div className="setting-group">
          <h3>Privacy</h3>
          <div className="setting">
            <div className="setting-label">
              <strong>Lock app</strong>
              <span>Sign out on this device. You&apos;ll need your passcode to get back in.</span>
            </div>
            <button className="btn btn-ghost" onClick={onLock}>
              <LockIcon /> Lock
            </button>
          </div>
        </div>
      )}

      <div className="setting-group">
        <h3>Data</h3>
        <div className="setting">
          <div className="setting-label">
            <strong>Clear chat history</strong>
            <span>Permanently delete all your conversations</span>
          </div>
          <button className="btn btn-ghost" onClick={onClearAll} disabled={!hasChats} style={{ color: "var(--danger)" }}>
            <TrashIcon /> Clear
          </button>
        </div>
      </div>
    </Modal>
  );
}
