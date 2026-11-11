"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ARGIE_AVATAR } from "@/lib/knowledge/photos";
import { Logo } from "./Logo";
import { BookIcon, FeatherIcon, HeartIcon, SmileIcon, SparklesIcon, TargetIcon, UserIcon } from "./Icons";

interface Suggestion {
  title: string;
  desc: string;
  icon: ReactNode;
}

const SUGGESTIONS: Suggestion[] = [
  { title: "Bro, who am I?", desc: "Let Bro describe you (with pics)", icon: <UserIcon /> },
  { title: "Hype me up, Bro.", desc: "Instant confidence boost", icon: <SparklesIcon /> },
  { title: "Help me review for my criminology exam.", desc: "Study buddy mode", icon: <BookIcon /> },
  { title: "Tell me something funny.", desc: "Funny by default, remember?", icon: <SmileIcon /> },
  { title: "Write a poem about me.", desc: "Your favorite writing style", icon: <FeatherIcon /> },
  { title: "How do I start working toward getting rich?", desc: "The big goal", icon: <TargetIcon /> },
];

function greetingForNow(): string {
  const h = Number(
    new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "Asia/Manila" }).format(new Date()),
  );
  if (h < 5) return "Up late, Rabe?";
  if (h < 12) return "Maayong buntag, Rabe!";
  if (h < 18) return "Maayong hapon, Rabe!";
  return "Maayong gabii, Rabe!";
}

export function WelcomeScreen({ onPick, disabled }: { onPick: (text: string) => void; disabled?: boolean }) {
  // Time-based greeting is computed on the client to match Rabe's clock.
  const [hello, setHello] = useState("Hey, Rabe!");
  useEffect(() => setHello(greetingForNow()), []);

  return (
    <div className="welcome">
      <div className="orb-wrap" aria-hidden="true">
        <div className="orb-glow" />
        <div className="orb-ring" />
        <span className="orb-photo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ARGIE_AVATAR} alt="" width={112} height={112} />
        </span>
      </div>

      <span className="eyebrow">
        <HeartIcon /> Bro · your AI best friend
      </span>
      <h1 className="hero-title">{hello}</h1>
      <p className="hero-sub">RABÉ · The Argie Experience</p>
      <p className="hero-tagline">“Handsome by Nature, Funny by Default.”</p>

      <div className="greeting glass">
        <Logo size={30} />
        <p>
          It&apos;s me, <em>Bro</em>. Ready to help, hype you up, or just chill. Still handsome today? Obviously.{" "}
          <em>Unsa man atong hisgutan?</em>
        </p>
      </div>

      <div className="suggestions">
        {SUGGESTIONS.map((s, i) => (
          <button
            key={s.title}
            className="suggestion glass"
            style={{ animationDelay: `${120 + i * 60}ms` }}
            onClick={() => onPick(s.title)}
            onMouseMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
            }}
            disabled={disabled}
          >
            <span className="sug-icon">{s.icon}</span>
            <span className="sug-title">{s.title}</span>
            <span className="sug-desc">{s.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
