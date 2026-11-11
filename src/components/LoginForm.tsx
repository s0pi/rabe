"use client";

import { useRef, useState } from "react";
import { Logo } from "./Logo";

const Eye = ({ open }: { open: boolean }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {open ? (
      <>
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ) : (
      <>
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 19c-6.5 0-10-7-10-7a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c6.5 0 10 7 10 7a18.5 18.5 0 0 1-2.16 3.19" />
        <path d="m1 1 22 22" />
      </>
    )}
  </svg>
);

const Lock = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);

export function LoginForm({ next }: { next: string }) {
  const [passcode, setPasscode] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passcode.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      if (res.ok) {
        window.location.replace(next);
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "Couldn't unlock. Try again.");
      setShake((n) => n + 1);
      setPasscode("");
      inputRef.current?.focus();
    } catch {
      setError("Network error. Check your connection.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="aurora" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <main className="login">
        <form key={shake} className={`login-card glass ${shake ? "shake" : ""}`} onSubmit={submit}>
          <div className="login-logo">
            <div className="orb-glow" />
            <Logo size={72} />
          </div>
          <h1>Hey, is that you, Rabe?</h1>
          <p className="login-sub">Bro only talks to Rabe. Enter your passcode to continue.</p>

          <label htmlFor="passcode" className="sr-only">
            Passcode
          </label>
          <div className="login-field">
            <Lock />
            <input
              id="passcode"
              ref={inputRef}
              type={show ? "text" : "password"}
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="Passcode"
              autoComplete="current-password"
              autoFocus
              disabled={busy}
            />
            <button type="button" className="icon-btn" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide passcode" : "Show passcode"}>
              <Eye open={show} />
            </button>
          </div>

          {error && (
            <p className="login-error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="btn btn-primary login-btn" disabled={busy || !passcode.trim()}>
            {busy ? "Checking…" : "Unlock"}
          </button>
          <p className="login-foot">“Handsome by Nature, Funny by Default.”</p>
        </form>
      </main>
    </>
  );
}
