"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** A small centred popup (bottom sheet on phones). Escape and a tap outside close it. */
export function Modal({ title, onClose, children, labelledBy = "sharing-modal-title" }: { title: string; onClose: () => void; children: ReactNode; labelledBy?: string }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLElement>("input, button")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); prev?.focus?.(); };
  }, [onClose]);
  return (
    <div className="app-frame fixed inset-0 z-[90] flex items-end justify-center bg-black/40 p-4 sm:items-center" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={box} role="dialog" aria-modal="true" aria-labelledby={labelledBy} className="w-full max-w-sm rounded-xl border bg-background p-5 shadow-xl">
        <h2 id={labelledBy} className="text-base font-semibold">{title}</h2>
        <div className="mt-2">{children}</div>
      </div>
    </div>
  );
}
