"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type FaceMood = "idle" | "thinking" | "searching" | "reading" | "waiting" | "talking" | "happy";

const FACES = {
  idle: "/argie/argie-avatar.webp",
  think: "/argie/face-think.webp",
  happy: "/argie/face-happy.webp",
};

const POKE_LINES = [
  "Pogi problems 😎",
  "Handsome by nature!",
  "Oy! Ayaw ko pisla 😤",
  "Kaya nimo na, Rabe! 💪",
  "Funny by default 😂",
  "Busy being handsome…",
  "Ask me anything, pre!",
  "Unsa man? 👀",
];

interface Props {
  mood: FaceMood;
  /** Short message to show in a speech bubble (e.g. "Noted! 🧠"). */
  say?: string | null;
}

/** Rabe's live floating face: floats, hops, thinks, and reacts. */
export function FloatingFace({ mood, say }: Props) {
  const [hop, setHop] = useState(false);
  const [tilt, setTilt] = useState(false);
  const [speech, setSpeech] = useState<string | null>(null);
  const speechTimer = useRef<number | null>(null);

  const showSpeech = useCallback((text: string, ms = 2200) => {
    setSpeech(text);
    if (speechTimer.current) window.clearTimeout(speechTimer.current);
    speechTimer.current = window.setTimeout(() => setSpeech(null), ms);
  }, []);

  // Idle life: random hops and head tilts so it feels alive.
  useEffect(() => {
    if (mood !== "idle") return;
    let t: number;
    const loop = () => {
      t = window.setTimeout(
        () => {
          if (Math.random() < 0.6) {
            setHop(true);
            window.setTimeout(() => setHop(false), 750);
          } else {
            setTilt(true);
            window.setTimeout(() => setTilt(false), 1400);
          }
          loop();
        },
        4500 + Math.random() * 4500,
      );
    };
    loop();
    return () => window.clearTimeout(t);
  }, [mood]);

  useEffect(() => {
    if (say) showSpeech(say, 2600);
  }, [say, showSpeech]);

  useEffect(() => () => {
    if (speechTimer.current) window.clearTimeout(speechTimer.current);
  }, []);

  const poke = () => {
    setHop(true);
    window.setTimeout(() => setHop(false), 750);
    showSpeech(POKE_LINES[Math.floor(Math.random() * POKE_LINES.length)]);
  };

  const thinkingish = mood === "thinking" || mood === "searching" || mood === "reading" || mood === "waiting";
  const src = thinkingish ? FACES.think : mood === "talking" || mood === "happy" ? FACES.happy : FACES.idle;
  const bubbleIcon = mood === "searching" ? "🔎" : mood === "reading" ? "📄" : mood === "waiting" ? "⏳" : null;
  const label =
    mood === "thinking"
      ? "Bro is thinking"
      : mood === "searching"
        ? "Bro is searching the web"
        : mood === "reading"
          ? "Bro is reading"
          : mood === "waiting"
            ? "Bro is waiting a moment"
            : mood === "talking"
              ? "Bro is answering"
              : "Rabe";

  return (
    <div className={`buddy mood-${mood} ${hop ? "hop" : ""} ${tilt ? "tilt" : ""}`}>
      {thinkingish && (
        <div className="buddy-thought" aria-hidden="true">
          <span className="puff p1" />
          <span className="puff p2" />
          <span className="cloud">{bubbleIcon ? <span className="cloud-icon">{bubbleIcon}</span> : <><i /><i /><i /></>}</span>
        </div>
      )}
      {speech && !thinkingish && (
        <div className="buddy-speech" role="status" key={speech}>
          {speech}
        </div>
      )}
      <button type="button" className="buddy-float" onClick={poke} aria-label={`${label}. Poke Rabe`} title="Poke me 👆">
        <span className="buddy-ring" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img key={src} src={src} alt="" width={64} height={64} draggable={false} />
        {mood === "happy" && (
          <span className="buddy-sparkles" aria-hidden="true">
            <i>✦</i>
            <i>✧</i>
            <i>✦</i>
          </span>
        )}
      </button>
      <span className="buddy-shadow" aria-hidden="true" />
    </div>
  );
}
