"use client";

import { memo, useRef, useState, type ComponentProps } from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { ARGIE_PHOTOS } from "@/lib/knowledge/photos";
import { rehypePhotoGrid } from "@/lib/rehype-photo-grid";
import { CheckIcon, CopyIcon } from "./Icons";
import { openPhotoViewer } from "./PhotoViewer";

function CodeBlock(props: ComponentProps<"pre">) {
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  const child = props.children as { props?: { className?: string } } | undefined;
  const lang = /language-([\w-]+)/.exec(child?.props?.className ?? "")?.[1] ?? "code";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(ref.current?.innerText ?? "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard blocked
    }
  };

  return (
    <div className="code-block">
      <div className="code-head">
        <span>{lang}</span>
        <button type="button" onClick={copy} aria-label="Copy code">
          {copied ? <CheckIcon /> : <CopyIcon />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre ref={ref}>{props.children}</pre>
    </div>
  );
}

/** Only photos from Argie's library may render; anything else is dropped. */
function ChatPhoto({ src, alt }: ComponentProps<"img">) {
  // Bro writes ![caption](photo:ID); older messages may use the full /argie/ path.
  const photo =
    typeof src === "string"
      ? ARGIE_PHOTOS.find((p) => (src.startsWith("photo:") ? p.id === src.slice(6).trim() : p.src === src))
      : undefined;
  if (!photo) return null;
  // Use Bro's caption, unless it just repeated the photo ID.
  const given = typeof alt === "string" ? alt.trim() : "";
  const caption = given && given !== photo.id && !/^[a-z0-9]+(-[a-z0-9]+)+$/.test(given) ? given : photo.caption;
  return (
    <button
      type="button"
      className="chat-photo"
      data-src={photo.src}
      data-caption={caption}
      onClick={(e) => {
        // Browse the photos in this message; a lone photo browses the whole library.
        const group = e.currentTarget.closest(".photo-grid");
        const buttons = group ? Array.from(group.querySelectorAll<HTMLElement>(".chat-photo")) : [];
        if (buttons.length > 1) {
          openPhotoViewer(
            buttons.map((b) => ({ src: b.dataset.src ?? "", caption: b.dataset.caption ?? "" })),
            buttons.indexOf(e.currentTarget),
          );
        } else {
          openPhotoViewer(
            ARGIE_PHOTOS.map((p) => ({ src: p.src, caption: p.caption })),
            ARGIE_PHOTOS.indexOf(photo),
          );
        }
      }}
      aria-label={`View photo: ${caption}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photo.src} alt={caption} width={photo.width} height={photo.height} loading="lazy" />
      <span className="chat-photo-cap">{caption}</span>
    </button>
  );
}

/** Keep our photo:ID references; sanitize every other URL as usual. */
const urlTransform = (url: string) => (/^photo:[\w-]+$/.test(url) ? url : defaultUrlTransform(url));

const components = {
  pre: CodeBlock,
  img: ChatPhoto,
  a: ({ href, children }: ComponentProps<"a">) => (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
};

/** Renders AI replies. remark-breaks keeps single line breaks (for poetry). */
export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[rehypePhotoGrid]}
        components={components}
        urlTransform={urlTransform}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
});
