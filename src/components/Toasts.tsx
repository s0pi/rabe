"use client";

import { AlertIcon, CheckIcon } from "./Icons";

export interface Toast {
  id: number;
  kind: "error" | "success";
  text: string;
}

export function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          {t.kind === "error" ? <AlertIcon /> : <CheckIcon />}
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}
