"use client";

import { useEffect, useState } from "react";
import { Camera, Crop, ImageUp, Loader2, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ReceiptCropper } from "@/components/ReceiptCropper";
import { BARCODE_FORMATS, CARD_CATEGORIES, CARD_COLORS, cleanNumber, colorForName, detectFormat, formatLabel, formatProblem, type BarcodeFormat, type LoyaltyCard } from "@/lib/loyalty";
import { compressCardImage, LOYALTY_ACCEPT, saveLoyaltyCard, updateLoyaltyCard, type CompressedCard } from "@/lib/loyalty-image";
import { Barcode } from "./Barcode";
import { useCardPhoto } from "./CardFace";

const label = "text-sm font-medium";

type Side = "front" | "back";
type Slot = { photo: CompressedCard | null; removed: boolean };
const EMPTY: Slot = { photo: null, removed: false };

function useObjectUrl(file: File | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) { setUrl(null); return; }
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return url;
}

/** One side of the card: a card-shaped preview with Upload, Scan, Crop and Remove. */
function PhotoSlot({ side, savedPath, slot, busy, onFile, onCrop, onRemove }: { side: Side; savedPath: string | null | undefined; slot: Slot; busy: boolean; onFile: (f: File | undefined) => void; onCrop: () => void; onRemove: () => void }) {
  const savedUrl = useCardPhoto(slot.removed ? null : savedPath);
  const newUrl = useObjectUrl(slot.photo?.file ?? null);
  const url = newUrl ?? savedUrl;
  const has = !!slot.photo || (!!savedPath && !slot.removed);
  const name = side === "front" ? "Front" : "Back";
  const btn = "flex h-10 items-center justify-center gap-1.5 rounded-lg border bg-background px-2 text-[13px] font-medium hover:bg-muted disabled:opacity-50";
  return (
    <div className="min-w-0 space-y-2" data-testid={`slot-${side}`}>
      <p className="text-sm font-medium">{name}</p>
      <div className={cn("relative flex aspect-[1.586] items-center justify-center overflow-hidden rounded-xl", has ? "border bg-muted/40" : "border-2 border-dashed border-primary/40 bg-primary/5")}>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={`${name} of the card`} className="h-full w-full object-cover" />
        ) : has ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading the photo" />
        ) : (
          <p className="px-2 text-center text-xs text-muted-foreground">No {name.toLowerCase()} photo</p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <label className={cn(btn, "cursor-pointer", busy && "pointer-events-none opacity-50")}>
          <ImageUp className="h-4 w-4" aria-hidden="true" /> Upload
          <input type="file" accept={LOYALTY_ACCEPT} className="sr-only" aria-label={`Upload ${side} photo`} disabled={busy} onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        <label className={cn(btn, "cursor-pointer", busy && "pointer-events-none opacity-50")}>
          <Camera className="h-4 w-4" aria-hidden="true" /> Scan
          <input type="file" accept="image/*" capture="environment" className="sr-only" aria-label={`Scan ${side} photo`} disabled={busy} onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        {has && (
          <>
            <button type="button" className={btn} onClick={onCrop} disabled={busy || !url}><Crop className="h-4 w-4" aria-hidden="true" /> Crop</button>
            <button type="button" className={cn(btn, "text-red-600")} onClick={onRemove} disabled={busy}><Trash2 className="h-4 w-4" aria-hidden="true" /> Remove</button>
          </>
        )}
      </div>
    </div>
  );
}

/** Add or edit a card. A photo is shrunk to 800 px (WebP, quality 0.7) the moment it is picked. */
export function CardForm({ userId, card, onSaved, onClose }: { userId: string; card: LoyaltyCard | null; onSaved: (c: LoyaltyCard) => void; onClose: () => void }) {
  const [store, setStore] = useState(card?.store_name ?? "");
  const [holder, setHolder] = useState(card?.holder_name ?? "");
  const [category, setCategory] = useState(card?.category ?? "");
  const [number, setNumber] = useState(card?.card_number ?? "");
  const [format, setFormat] = useState<BarcodeFormat | "auto">(card?.barcode_format ?? "auto");
  const [color, setColor] = useState<string | null>(card?.color ?? null);
  const [slots, setSlots] = useState<Record<Side, Slot>>({ front: EMPTY, back: EMPTY });
  const [cropping, setCropping] = useState<{ side: Side; file: File } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && !cropping && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [busy, cropping, onClose]);

  const frontUrl = useCardPhoto(slots.front.removed ? null : card?.image_path);
  const backUrl = useCardPhoto(slots.back.removed ? null : card?.back_image_path);
  const chosen: BarcodeFormat = format === "auto" ? detectFormat(number) : format;
  const problem = number.trim() ? formatProblem(number, chosen) : null;
  const shownColor = color || (store.trim() ? colorForName(store) : CARD_COLORS[0]);
  const set = (side: Side, slot: Slot) => setSlots((x) => ({ ...x, [side]: slot }));

  /** A picked or scanned photo first goes to the cropper, so only the card itself is kept. */
  function choose(side: Side, file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!/^image\//.test(file.type)) return setError("Choose a JPG, PNG or WebP photo.");
    setCropping({ side, file });
  }

  async function finishCrop(side: Side, file: File) {
    setCropping(null);
    setError(null);
    setBusy(true);
    try {
      set(side, { photo: await compressCardImage(file), removed: false });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not use that photo.");
    } finally {
      setBusy(false);
    }
  }

  /** Crop what is already there: the new photo, or the saved one fetched back. */
  async function recrop(side: Side, savedUrl: string | null) {
    setError(null);
    const fresh = slots[side].photo?.file;
    if (fresh) return setCropping({ side, file: fresh });
    if (!savedUrl) return;
    setBusy(true);
    try {
      const blob = await (await fetch(savedUrl)).blob();
      setCropping({ side, file: new File([blob], `${side}.${blob.type === "image/webp" ? "webp" : "jpg"}`, { type: blob.type || "image/jpeg" }) });
    } catch {
      setError("Could not open the saved photo to crop it. Upload or scan it again instead.");
    } finally {
      setBusy(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!store.trim()) return setError("Enter the store name.");
    const n = cleanNumber(number, chosen);
    const bad = formatProblem(n, chosen);
    if (bad) return setError(bad);
    setError(null);
    setBusy(true);
    try {
      const supabase = createClient();
      const input = { store_name: store, holder_name: holder, category, card_number: n, barcode_format: chosen, color };
      const change = (x: Slot) => (x.photo ? x.photo.file : x.removed ? null : undefined);
      const saved = card
        ? await updateLoyaltyCard(supabase, userId, card, input, change(slots.front), change(slots.back))
        : await saveLoyaltyCard(supabase, userId, input, change(slots.front), change(slots.back));
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the card.");
      setBusy(false);
    }
  }

  return (
    <div className="app-frame fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/70 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={card ? "Edit card" : "Add a card"} onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <form onSubmit={save} className="flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-card text-card-foreground shadow-2xl sm:rounded-2xl">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b p-4 sm:px-5">
          <h2 className="text-xl font-bold">{card ? "Edit card" : "Add a card"}</h2>
          <Button type="button" variant="outline" size="icon" className="h-11 w-11" onClick={onClose} disabled={busy} aria-label="Close"><X className="h-5 w-5" /></Button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:px-5">
        <div className="grid grid-cols-2 gap-3">
          <PhotoSlot side="front" savedPath={card?.image_path} slot={slots.front} busy={busy} onFile={(f) => choose("front", f)} onCrop={() => recrop("front", frontUrl)} onRemove={() => set("front", { photo: null, removed: true })} />
          <PhotoSlot side="back" savedPath={card?.back_image_path} slot={slots.back} busy={busy} onFile={(f) => choose("back", f)} onCrop={() => recrop("back", backUrl)} onRemove={() => set("back", { photo: null, removed: true })} />
        </div>
        <p className="-mt-2 text-xs text-muted-foreground">Optional. Upload or scan each side, then crop so only the card is kept. Photos are shrunk to 800 px before they are saved.</p>

        <div className="space-y-1.5">
          <label htmlFor="lc-store" className={label}>Store name</label>
          <Input id="lc-store" value={store} onChange={(e) => setStore(e.target.value)} maxLength={80} className="h-11 text-base" placeholder="Greenfield Market" autoComplete="off" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="lc-cat" className={label}>Card type <span className="font-normal text-muted-foreground">(optional)</span></label>
            <Input id="lc-cat" list="lc-cats" value={category} onChange={(e) => setCategory(e.target.value)} maxLength={40} className="h-11 text-base" placeholder="Rewards" autoComplete="off" />
            <datalist id="lc-cats">{CARD_CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="lc-holder" className={label}>Card holder <span className="font-normal text-muted-foreground">(optional)</span></label>
            <Input id="lc-holder" value={holder} onChange={(e) => setHolder(e.target.value)} maxLength={80} className="h-11 text-base" autoComplete="off" />
          </div>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="lc-number" className={label}>Barcode or card number</label>
          <Input id="lc-number" value={number} onChange={(e) => setNumber(e.target.value)} className="h-11 text-base tracking-wider" inputMode="text" autoComplete="off" placeholder="4021 8830 1177" />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="lc-format" className={label}>Barcode format</label>
          <select id="lc-format" value={format} onChange={(e) => setFormat(e.target.value as BarcodeFormat | "auto")} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-base">
            <option value="auto">Auto-detect{number.trim() ? ` (${formatLabel(detectFormat(number))})` : ""}</option>
            {BARCODE_FORMATS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
          <p className="text-xs text-muted-foreground">Auto-detect picks the format from the number. Change it if the till does not scan.</p>
        </div>

        <fieldset className="space-y-1.5">
          <legend className={label}>Card colour</legend>
          <div className="flex flex-wrap gap-2">
            {CARD_COLORS.map((c) => (
              <button key={c} type="button" onClick={() => setColor(c)} aria-label={`Colour ${c}`} aria-pressed={shownColor === c} className={cn("h-9 w-9 rounded-full ring-offset-2 ring-offset-card", shownColor === c ? "ring-2 ring-foreground" : "")} style={{ background: c }} />
            ))}
          </div>
        </fieldset>

        {number.trim() && !problem && (
          <div className="rounded-xl border bg-white p-3 text-black">
            <p className="mb-1.5 text-xs text-slate-500">Preview</p>
            <Barcode value={number} format={chosen} label="Barcode preview" className={chosen === "QR" ? "mx-auto block h-32 w-32" : "block h-14 w-full"} />
          </div>
        )}
        {problem && <p className="text-sm text-destructive" role="alert">{problem}</p>}
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

        </div>

        <div className="flex shrink-0 gap-2.5 border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-5">
          <Button type="button" variant="outline" className="h-11 flex-1" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" className="h-11 flex-[2]" disabled={busy || !!problem}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {card ? "Save changes" : "Save card"}
          </Button>
        </div>
      </form>
      {cropping && <ReceiptCropper file={cropping.file} title="Crop to the card" initialCrop={{ x: 4, y: 4, w: 92, h: 92 }} hint="Drag the frame so only the card is inside." onDone={(f) => finishCrop(cropping.side, f)} onCancel={() => setCropping(null)} />}
    </div>
  );
}
