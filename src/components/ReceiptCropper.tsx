"use client";

import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";

type Crop = { x: number; y: number; w: number; h: number }; // percentages 0-100 of the image

/** Overlay that lets the user crop a receipt photo to the ticket, or keep the full image. */
export function ReceiptCropper({
  file,
  onDone,
  onCancel,
  title = "Crop to the ticket",
  initialCrop = { x: 8, y: 8, w: 84, h: 84 },
  hint,
}: {
  file: File;
  onDone: (file: File) => void;
  onCancel: () => void;
  title?: string;
  initialCrop?: Crop;
  hint?: string;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop>(initialCrop);
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ mode: "move" | "nw" | "ne" | "sw" | "se"; startX: number; startY: number; start: Crop } | null>(null);

  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const onPointerDown = (e: React.PointerEvent, mode: "move" | "nw" | "ne" | "sw" | "se") => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { mode, startX: e.clientX, startY: e.clientY, start: crop };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const dx = ((e.clientX - d.startX) / rect.width) * 100;
    const dy = ((e.clientY - d.startY) / rect.height) * 100;
    const c = { ...d.start };
    if (d.mode === "move") {
      c.x = Math.min(100 - c.w, Math.max(0, c.x + dx));
      c.y = Math.min(100 - c.h, Math.max(0, c.y + dy));
    } else {
      if (d.mode.includes("w")) {
        const nx = Math.min(c.x + c.w - 12, Math.max(0, c.x + dx));
        c.w = c.w + (c.x - nx);
        c.x = nx;
      }
      if (d.mode.includes("e")) c.w = Math.min(100 - c.x, Math.max(12, c.w + dx));
      if (d.mode.includes("n")) {
        const ny = Math.min(c.y + c.h - 12, Math.max(0, c.y + dy));
        c.h = c.h + (c.y - ny);
        c.y = ny;
      }
      if (d.mode.includes("s")) c.h = Math.min(100 - c.y, Math.max(12, c.h + dy));
    }
    setCrop(c);
  };

  const onPointerUp = () => {
    drag.current = null;
  };

  const applyCrop = async (full: boolean) => {
    if (!imgRef.current) return;
    setBusy(true);
    try {
      const img = imgRef.current;
      const canvas = document.createElement("canvas");
      const sx = full ? 0 : (crop.x / 100) * img.naturalWidth;
      const sy = full ? 0 : (crop.y / 100) * img.naturalHeight;
      const sw = full ? img.naturalWidth : (crop.w / 100) * img.naturalWidth;
      const sh = full ? img.naturalHeight : (crop.h / 100) * img.naturalHeight;
      canvas.width = Math.max(1, Math.round(sw));
      canvas.height = Math.max(1, Math.round(sh));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas unavailable");
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.92));
      if (!blob) throw new Error("Crop failed");
      const cropped = new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
      onDone(cropped);
    } finally {
      setBusy(false);
    }
  };

  if (!url) return null;

  return (
    <div className="app-frame fixed inset-0 z-[70] flex flex-col bg-black/95" onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
      <div className="flex items-center justify-between p-3 text-white">
        <p className="text-sm font-medium">{title}</p>
        <button type="button" onClick={onCancel} className="p-1" aria-label="Cancel crop">
          <X className="h-5 w-5" />
        </button>
      </div>

      {hint && <p className="px-4 pb-2 text-xs text-white/80">{hint}</p>}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden px-3">
        <div className="relative inline-block max-h-full max-w-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img ref={imgRef} src={url} alt="Crop source" className="block max-h-[60dvh] max-w-full object-contain" />
          <div
            className="absolute border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] cursor-move touch-none"
            style={{ left: `${crop.x}%`, top: `${crop.y}%`, width: `${crop.w}%`, height: `${crop.h}%` }}
            onPointerDown={(e) => onPointerDown(e, "move")}
          >
            {(["nw", "ne", "sw", "se"] as const).map((h) => (
              <span
                key={h}
                onPointerDown={(e) => onPointerDown(e, h)}
                className={`absolute h-6 w-6 bg-white rounded-sm border border-black/20 ${
                  h === "nw" ? "-left-3 -top-3 cursor-nwse-resize" :
                  h === "ne" ? "-right-3 -top-3 cursor-nesw-resize" :
                  h === "sw" ? "-left-3 -bottom-3 cursor-nesw-resize" :
                  "-right-3 -bottom-3 cursor-nwse-resize"
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="flex gap-3 p-4 pb-6">
        <button
          type="button"
          disabled={busy}
          onClick={() => applyCrop(true)}
          className="flex-1 h-11 rounded-lg border border-white/30 text-white text-sm font-medium"
        >
          Use full image
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => applyCrop(false)}
          className="flex-1 h-11 rounded-lg bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center justify-center gap-2"
        >
          <Check className="h-4 w-4" /> Crop
        </button>
      </div>
    </div>
  );
}
