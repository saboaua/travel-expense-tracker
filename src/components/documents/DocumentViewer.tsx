"use client";

import { useEffect } from "react";
import { Download, X } from "lucide-react";
import { fileKind } from "@/lib/documents";

/** Full-screen preview of an uploaded document (photo or PDF). */
export function DocumentViewer({ title, url, path, onClose }: { title: string; url: string; path: string; onClose: () => void }) {
  const kind = fileKind(path);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="app-frame fixed inset-0 z-[70] flex flex-col bg-black/80" role="dialog" aria-modal="true" aria-label={`Viewing ${title}`}>
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-white">
        <p className="min-w-0 truncate font-medium">{title}</p>
        <div className="flex shrink-0 items-center gap-1">
          <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm hover:bg-white/10" aria-label="Open in a new tab or download">
            <Download className="h-4 w-4" /> <span className="hidden sm:inline">Open / download</span>
          </a>
          <button type="button" onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-white/10" aria-label="Close viewer" autoFocus>
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-2 sm:p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
        {kind === "pdf" ? (
          <iframe src={url} title={title} className="h-full w-full max-w-4xl rounded-lg bg-white" />
        ) : kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={title} className="max-h-full max-w-full rounded-lg object-contain" />
        ) : (
          <div className="rounded-xl bg-card p-6 text-center text-sm text-card-foreground">
            <p className="mb-3">This file type cannot be previewed here (for example HEIC photos from some phones).</p>
            <a href={url} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">Open or download it</a>
          </div>
        )}
      </div>
    </div>
  );
}
