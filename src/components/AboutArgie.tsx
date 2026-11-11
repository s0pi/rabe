"use client";

import type { ReactNode } from "react";
import { ARGIE_PROFILE as A } from "@/lib/knowledge/argie";
import { ARGIE_AVATAR, ARGIE_PHOTOS, PHOTO_CATEGORIES } from "@/lib/knowledge/photos";
import { Modal } from "./Modal";
import { openPhotoViewer } from "./PhotoViewer";
import { MemoryPanel } from "./MemoryPanel";

const GALLERY = ARGIE_PHOTOS.map((p) => ({ src: p.src, caption: p.caption }));

const CameraIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
    <circle cx="12" cy="13" r="3" />
  </svg>
);
import {
  CakeIcon,
  ChatIcon,
  FeatherIcon,
  GamepadIcon,
  GradCapIcon,
  HeartIcon,
  LanguagesIcon,
  PinIcon,
  SmileIcon,
  SparklesIcon,
  TargetIcon,
  UserIcon,
  WrenchIcon,
} from "./Icons";

function Card({
  icon,
  title,
  children,
  span2,
  delay = 0,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  span2?: boolean;
  delay?: number;
}) {
  return (
    <section className={`about-card ${span2 ? "span-2" : ""}`} style={{ animationDelay: `${delay}ms` }}>
      <div className="about-card-head">
        <span className="sug-icon">{icon}</span>
        <h4>{title}</h4>
      </div>
      {children}
    </section>
  );
}

export function AboutArgie({ onClose, onAsk }: { onClose: () => void; onAsk: (q: string) => void }) {
  const p = A.profile;
  const e = A.education;
  const c = A.communication;

  return (
    <Modal title="About Rabe · Bro's notes on you" icon={<UserIcon width={20} height={20} color="var(--lavender)" />} onClose={onClose} wide>
      <div className="about-hero">
        <button
          className="about-avatar"
          onClick={() => openPhotoViewer(GALLERY, 0)}
          aria-label="View your portrait"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ARGIE_AVATAR} alt="Rabe" width={92} height={92} />
        </button>
        <div>
          <h3>{p.fullName}</h3>
          <div className="aka">
            a.k.a. {p.preferredName} · “{p.nickname}” · “{p.selfDescription}”
          </div>
          <div className="tag">{A.agent.tagline}</div>
          <div className="about-meta">
            <span><CakeIcon /> {p.age} years old</span>
            <span><PinIcon /> Libona, Bukidnon</span>
            <span><GradCapIcon /> {e.yearLevel} BSCRIM</span>
          </div>
        </div>
      </div>

      <div className="about-grid">
        <Card icon={<GradCapIcon />} title="Education" span2 delay={40}>
          <p className="big">{e.course}</p>
          <p>{e.school}</p>
          <p className="muted">{e.yearLevel} · Academic achievements: not shared yet</p>
        </Card>

        <Card icon={<PinIcon />} title="Hometown" delay={80}>
          <p className="big">Libona, Bukidnon</p>
          <p className="muted">{p.location}</p>
        </Card>

        <Card icon={<SmileIcon />} title="Personality" span2 delay={120}>
          <div className="chips">
            {A.personality.map((t) => (
              <span key={t} className="chip">{t}</span>
            ))}
          </div>
        </Card>

        <Card icon={<GamepadIcon />} title="Interests & hobbies" delay={160}>
          <div className="chips">
            {A.interests.map((t) => (
              <span key={t} className="chip">{t}</span>
            ))}
          </div>
        </Card>

        <Card icon={<HeartIcon />} title="Values" delay={200}>
          <p className="big">Maka-Diyos</p>
          <p className="muted">God-fearing</p>
        </Card>

        <Card icon={<TargetIcon />} title="Life goal" delay={240}>
          <p className="big">{A.goals[0]}</p>
          <p className="muted">Bro believes in you. Mostly. 😏</p>
        </Card>

        <Card icon={<WrenchIcon />} title="Skills" delay={280}>
          <p className="big">{A.skills.summary}</p>
          <p className="muted">The handy type.</p>
        </Card>

        <Card icon={<LanguagesIcon />} title="Talks in" delay={320}>
          <div className="chips">
            {c.languages.map((t) => (
              <span key={t} className="chip">{t}</span>
            ))}
          </div>
          <p className="muted">{c.style}</p>
        </Card>

        <Card icon={<FeatherIcon />} title="Writing style" delay={360}>
          <p className="big">{c.favoriteWritingStyle}</p>
          <p className="muted">Prefers {c.preferredResponseMethod.toLowerCase()}</p>
        </Card>

        <Card icon={<ChatIcon />} title="Pet peeve" delay={400}>
          <p className="big">{c.dislikes[0]}</p>
          <p className="muted">So Bro keeps it clear.</p>
        </Card>
      </div>

      <MemoryPanel />

      <section className="about-gallery" aria-label="Your photos">
        <div className="about-gallery-head">
          <h4>
            <CameraIcon /> Photo evidence of the handsomeness
          </h4>
          <span>{ARGIE_PHOTOS.length} photos</span>
        </div>
        {PHOTO_CATEGORIES.map((cat) => {
          const items = ARGIE_PHOTOS.filter((p) => p.category === cat.id);
          if (!items.length) return null;
          return (
            <div key={cat.id} className="gallery-section">
              <div className="gallery-label">
                {cat.label} <span>{items.length}</span>
              </div>
              <div className="gallery-grid">
                {items.map((photo, i) => (
                  <button
                    key={photo.id}
                    className="gallery-item"
                    style={{ animationDelay: `${200 + i * 40}ms` }}
                    onClick={() => openPhotoViewer(GALLERY, ARGIE_PHOTOS.indexOf(photo))}
                    aria-label={`View photo: ${photo.caption}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo.src} alt={photo.caption} loading="lazy" width={photo.width} height={photo.height} />
                    <span>{photo.caption}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </section>

      <div className="about-cta">
        <span>That's everything Bro knows about you so far, Rabe. Tell Bro more anytime.</span>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="pill-btn" onClick={() => onAsk("Write a poem about me.")}>
            <FeatherIcon /> Poem about me
          </button>
          <button className="btn btn-primary" onClick={() => onAsk("Bro, who am I?")}>
            <SparklesIcon /> Ask Bro
          </button>
        </div>
      </div>
    </Modal>
  );
}
