"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { Attachment, AttachmentKind } from "@/lib/types";
import { ArrowUpIcon, CloseIcon, StopIcon } from "./Icons";
import { FloatingFace, type FaceMood } from "./FloatingFace";

const MAX = 8000;
const MAX_FILES = 5;
const MAX_BYTES = 4 * 1024 * 1024;
const ACCEPT = ".jpg,.jpeg,.png,.webp,.gif,.pdf,.docx,.pptx,image/jpeg,image/png,image/webp,image/gif,application/pdf";

export interface ComposerHandle {
  focus: () => void;
  addFiles: (files: FileList | File[]) => void;
}

interface Pending {
  localId: string;
  name: string;
  kind: AttachmentKind | null;
  status: "uploading" | "ready" | "error";
  attachment?: Attachment;
  error?: string;
  previewUrl?: string;
}

interface Props {
  busy: boolean;
  disabled?: boolean;
  enterToSend: boolean;
  mood: FaceMood;
  faceSay?: string | null;
  onSend: (text: string, attachments: Attachment[]) => void;
  onStop: () => void;
}

function kindFromName(name: string, type: string): AttachmentKind | null {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (type.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) return "image";
  if (ext === "pdf" || type === "application/pdf") return "pdf";
  if (ext === "docx") return "docx";
  if (ext === "pptx") return "pptx";
  return null;
}

/** Shrinks big phone photos in the browser so they fit the upload limit. */
async function shrinkImage(file: File): Promise<Blob> {
  if (file.size <= 2.5 * 1024 * 1024 || file.type === "image/gif") return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 2200 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.88));
    return blob ?? file;
  } catch {
    return file;
  }
}

const KIND_ICON: Record<AttachmentKind, { label: string; cls: string }> = {
  image: { label: "IMG", cls: "img" },
  pdf: { label: "PDF", cls: "pdf" },
  docx: { label: "DOC", cls: "doc" },
  pptx: { label: "PPT", cls: "ppt" },
};

export function FileBadge({ kind }: { kind: AttachmentKind }) {
  const k = KIND_ICON[kind];
  return <span className={`file-badge ${k.cls}`}>{k.label}</span>;
}

const ClipIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  </svg>
);

export const Composer = forwardRef<ComposerHandle, Props>(function Composer(
  { busy, disabled, enterToSend, mood, faceSay, onSend, onStop },
  ref,
) {
  const [value, setValue] = useState("");
  const [coarse, setCoarse] = useState(false);
  const [files, setFiles] = useState<Pending[]>([]);
  const [dragging, setDragging] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = useCallback(async (p: Pending, file: File) => {
    try {
      const body = new FormData();
      const blob = p.kind === "image" ? await shrinkImage(file) : file;
      if (blob.size > MAX_BYTES) throw new Error("Too big (max 4 MB). Try a smaller file.");
      body.append("file", blob, file.name);
      const res = await fetch("/api/upload", { method: "POST", body });
      const data = (await res.json().catch(() => ({}))) as { attachment?: Attachment; error?: string };
      if (!res.ok || !data.attachment) throw new Error(data.error ?? `Upload failed (${res.status})`);
      setFiles((list) => list.map((x) => (x.localId === p.localId ? { ...x, status: "ready", attachment: data.attachment } : x)));
    } catch (err) {
      setFiles((list) =>
        list.map((x) => (x.localId === p.localId ? { ...x, status: "error", error: (err as Error).message } : x)),
      );
    }
  }, []);

  const filesRef = useRef<Pending[]>([]);
  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  const addFiles = useCallback(
    (incoming: FileList | File[]) => {
      const arr = Array.from(incoming);
      const room = Math.max(0, MAX_FILES - filesRef.current.filter((f) => f.kind).length);
      const jobs: { p: Pending; file: File }[] = [];
      const added: Pending[] = arr.slice(0, room).map((file) => {
        const kind = kindFromName(file.name, file.type);
        const p: Pending = {
          localId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name: file.name || "pasted-image.png",
          kind,
          status: kind ? "uploading" : "error",
          error: kind ? undefined : "Only photos, PDF, Word (.docx) and PowerPoint (.pptx).",
          previewUrl: kind === "image" ? URL.createObjectURL(file) : undefined,
        };
        if (kind) jobs.push({ p, file });
        return p;
      });
      const skipped = arr.length - added.length;
      if (skipped) {
        added.push({
          localId: `max-${Date.now()}`,
          name: `${skipped} more file${skipped > 1 ? "s" : ""}`,
          kind: null,
          status: "error",
          error: `Max ${MAX_FILES} files per message.`,
        });
      }
      filesRef.current = [...filesRef.current, ...added];
      setFiles((list) => [...list, ...added]);
      for (const { p, file } of jobs) void upload(p, file);
    },
    [upload],
  );

  useImperativeHandle(ref, () => ({ focus: () => taRef.current?.focus(), addFiles }), [addFiles]);

  useEffect(() => {
    setCoarse(window.matchMedia("(pointer: coarse)").matches);
  }, []);

  // Auto-resize the textarea to fit its content.
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 220)}px`;
  }, [value]);

  const removeFile = (id: string) =>
    setFiles((list) => {
      const f = list.find((x) => x.localId === id);
      if (f?.previewUrl) URL.revokeObjectURL(f.previewUrl);
      return list.filter((x) => x.localId !== id);
    });

  const ready = files.filter((f) => f.status === "ready" && f.attachment).map((f) => f.attachment!);
  const uploading = files.some((f) => f.status === "uploading");
  const trimmed = value.trim();
  const over = value.length > MAX;
  const canSend = !busy && !disabled && !uploading && !over && (trimmed.length > 0 || ready.length > 0);

  const submit = () => {
    if (!canSend) return;
    onSend(trimmed, ready);
    setValue("");
    files.forEach((f) => f.previewUrl && URL.revokeObjectURL(f.previewUrl));
    setFiles([]);
    requestAnimationFrame(() => taRef.current?.focus());
  };

  // On phones Enter inserts a newline; send with the button instead.
  const enterSends = enterToSend && !coarse;

  return (
    <div className="composer-dock">
      <div className="composer-inner">
        <FloatingFace mood={mood} say={faceSay} />
        <form
          className={`composer ${busy ? "busy" : ""} ${dragging ? "dragging" : ""} ${files.length ? "has-files" : ""}`}
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes("Files")) {
              e.preventDefault();
              setDragging(true);
            }
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
          }}
        >
          {files.length > 0 && (
            <div className="attach-row">
              {files.map((f) => (
                <div key={f.localId} className={`attach-chip ${f.status}`} title={f.error ?? f.attachment?.note ?? f.name}>
                  {f.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={f.previewUrl} alt="" className="attach-thumb" />
                  ) : f.kind ? (
                    <FileBadge kind={f.kind} />
                  ) : (
                    <span className="file-badge bad">!</span>
                  )}
                  <span className="attach-info">
                    <span className="attach-name">{f.name}</span>
                    <span className="attach-status">
                      {f.status === "uploading"
                        ? f.kind === "image"
                          ? "Bro is looking…"
                          : "Reading…"
                        : f.status === "error"
                          ? f.error
                          : f.attachment?.pages
                            ? `${f.attachment.pages} ${f.kind === "pptx" ? "slides" : "pages"} · ready`
                            : "Ready"}
                    </span>
                  </span>
                  {f.status === "uploading" && <span className="attach-spin" aria-hidden="true" />}
                  <button type="button" className="attach-x" onClick={() => removeFile(f.localId)} aria-label={`Remove ${f.name}`}>
                    <CloseIcon />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="composer-row">
            <button
              type="button"
              className="attach-btn"
              onClick={() => fileRef.current?.click()}
              disabled={disabled || files.length >= MAX_FILES}
              aria-label="Attach photo, PDF, Word or PowerPoint"
              title="Attach photo, PDF, Word or PowerPoint"
            >
              <ClipIcon />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT}
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files?.length) addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <label htmlFor="composer-input" className="sr-only">
              Message Bro
            </label>
            <textarea
              id="composer-input"
              ref={taRef}
              rows={1}
              value={value}
              placeholder={busy ? "Bro is typing…" : files.length ? "Ask Bro about your file…" : "Talk to Bro… anything at all, Rabe"}
              onChange={(e) => setValue(e.target.value)}
              onPaste={(e) => {
                const pasted = Array.from(e.clipboardData.files);
                if (pasted.length) {
                  e.preventDefault();
                  addFiles(pasted);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  const send = enterSends ? !e.shiftKey : e.ctrlKey || e.metaKey;
                  if (send) {
                    e.preventDefault();
                    submit();
                  }
                }
              }}
              disabled={disabled}
              autoFocus
            />
            {busy ? (
              <button type="button" className="send-btn stop" onClick={onStop} aria-label="Stop generating" title="Stop">
                <StopIcon />
              </button>
            ) : (
              <button
                type="submit"
                className="send-btn"
                disabled={!canSend}
                aria-label={uploading ? "Waiting for files to finish" : "Send message"}
                title={uploading ? "Waiting for files…" : "Send"}
              >
                <ArrowUpIcon />
              </button>
            )}
          </div>
          {dragging && <div className="drop-hint">Drop to attach 📎</div>}
        </form>
        <div className="composer-hint">
          <span className="hint-keys">
            {enterSends ? (
              <>
                <kbd>Enter</kbd> to send · <kbd>Shift</kbd> + <kbd>Enter</kbd> new line · 📎 photos, PDF, Word, PPT
              </>
            ) : (
              <>
                <kbd>Ctrl</kbd> + <kbd>Enter</kbd> to send · 📎 photos, PDF, Word, PPT
              </>
            )}
          </span>
          <span className={`counter ${over ? "over" : value.length > MAX * 0.9 ? "warn" : ""}`}>
            {value.length > MAX * 0.75 ? `${value.length.toLocaleString()} / ${MAX.toLocaleString()}` : "Bro can be wrong. Double-check important stuff."}
          </span>
        </div>
      </div>
    </div>
  );
});
