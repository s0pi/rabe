"use client";

import { useCallback, useEffect, useState } from "react";
import { CloseIcon } from "./Icons";

export interface ViewerPhoto {
  src: string;
  caption: string;
}

interface OpenDetail {
  photos: ViewerPhoto[];
  index: number;
}

const EVENT = "rabe:open-photo";

/** Open the full-screen photo viewer from anywhere (chat bubbles, gallery). */
export function openPhotoViewer(photos: ViewerPhoto[], index = 0) {
  window.dispatchEvent(new CustomEvent<OpenDetail>(EVENT, { detail: { photos, index } }));
}

const Chevron = ({ dir }: { dir: "left" | "right" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={dir === "left" ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"} />
  </svg>
);

/** Mount once (in ChatApp). Listens for openPhotoViewer() calls. */
export function PhotoViewer() {
  const [state, setState] = useState<OpenDetail | null>(null);

  useEffect(() => {
    const onOpen = (e: Event) => setState((e as CustomEvent<OpenDetail>).detail);
    window.addEventListener(EVENT, onOpen);
    return () => window.removeEventListener(EVENT, onOpen);
  }, []);

  const close = useCallback(() => setState(null), []);
  const step = useCallback(
    (d: number) =>
      setState((s) => (s && s.photos.length > 1 ? { ...s, index: (s.index + d + s.photos.length) % s.photos.length } : s)),
    [],
  );

  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        close();
      } else if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [state, close, step]);

  if (!state) return null;
  const photo = state.photos[state.index];
  const many = state.photos.length > 1;

  return (
    <div className="viewer" role="dialog" aria-modal="true" aria-label={photo.caption} onClick={close}>
      <button className="viewer-btn viewer-close" onClick={close} aria-label="Close photo">
        <CloseIcon />
      </button>
      {many && (
        <button
          className="viewer-btn viewer-prev"
          aria-label="Previous photo"
          onClick={(e) => {
            e.stopPropagation();
            step(-1);
          }}
        >
          <Chevron dir="left" />
        </button>
      )}
      <figure className="viewer-figure" onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img key={photo.src} src={photo.src} alt={photo.caption} />
        <figcaption>
          {photo.caption}
          {many && <span>{` · ${state.index + 1} / ${state.photos.length}`}</span>}
        </figcaption>
      </figure>
      {many && (
        <button
          className="viewer-btn viewer-next"
          aria-label="Next photo"
          onClick={(e) => {
            e.stopPropagation();
            step(1);
          }}
        >
          <Chevron dir="right" />
        </button>
      )}
    </div>
  );
}
