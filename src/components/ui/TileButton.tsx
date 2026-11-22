"use client";

import { useEffect, useRef, useState } from "react";
import { Pencil, type LucideIcon } from "lucide-react";
import { IconTile } from "@/components/ui/icon-tile";
import type { IconTone } from "@/lib/icon-tones";
import { TILE_COLORS, type TileId } from "@/lib/tile-colors";
import { useTileColors } from "@/lib/use-tile-colors";

/** The icon at the top of a Personal page. Tap it to pick its colour; the choice also colours its row in the Personal list. */
export function TileButton({ id, icon: Icon, tone, className = "h-11 w-11" }: { id: TileId; icon: LucideIcon; tone: IconTone; className?: string }) {
  const { colors, colorOf, save, error } = useTileColors();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  const color = colorOf(id);

  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  return (
    <span ref={box} className="relative inline-flex shrink-0 text-base font-normal" data-testid={`tile-button-${id}`}>
      <button type="button" aria-label="Change the colour of this icon" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="relative rounded-xl">
        <IconTile tone={tone} color={color ?? undefined} className={className}><Icon className="h-[22px] w-[22px]" /></IconTile>
        <span aria-hidden="true" className="absolute -bottom-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full border bg-card text-muted-foreground"><Pencil className="h-[11px] w-[11px]" /></span>
      </button>
      {open && (
        <span className="absolute left-0 top-full z-30 mt-2 block w-[min(21rem,calc(100vw-2rem))] rounded-2xl border bg-card p-4 text-foreground shadow-xl" data-testid="tile-picker">
          <span className="mb-2 block text-[13px] font-bold">Colour of this icon</span>
          <span className="flex flex-wrap gap-2.5" role="radiogroup" aria-label="Colour of this icon">
            {TILE_COLORS.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={c} onClick={() => save(id, c)} data-testid={`tile-color-${c.slice(1)}`}
                className="h-[30px] w-[30px] rounded-full" style={{ background: c, boxShadow: color === c ? `0 0 0 3px var(--card, #fff), 0 0 0 5px ${c}` : undefined }} />
            ))}
          </span>
          <span className="mt-2 flex items-center justify-between gap-3">
            <span className="max-w-[14rem] text-xs leading-snug text-muted-foreground">Shown on this page and in your Personal list. Only you see it.</span>
            <button type="button" onClick={() => save(id, null)} disabled={!colors[id]} className="min-h-11 shrink-0 text-[13px] font-bold text-primary disabled:text-muted-foreground" data-testid="tile-default">Use default</button>
          </span>
          {error && <span role="alert" className="mt-1 block text-xs text-red-600">{error}</span>}
        </span>
      )}
    </span>
  );
}
