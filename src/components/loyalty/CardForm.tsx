"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ImageUp, Loader2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/document-upload";
import { BARCODE_FORMATS, CARD_CATEGORIES, CARD_COLORS, cleanNumber, colorForName, detectFormat, formatLabel, formatProblem, type BarcodeFormat, type LoyaltyCard } from "@/lib/loyalty";
import { compressCardImage, LOYALTY_ACCEPT, LOYALTY_BUCKET, saveLoyaltyCard, updateLoyaltyCard, type CompressedCard } from "@/lib/loyalty-image";
import { Barcode } from "./Barcode";

const label = "text-sm font-medium";

/** Add or edit a card. A photo is shrunk to 800 px (WebP, quality 0.7) the moment it is picked. */
export function CardForm({ userId, card, onSaved, onClose }: { userId: string; card: LoyaltyCard | null; onSaved: (c: LoyaltyCard) => void; onClose: () => void }) {
  const [store, setStore] = useState(card?.store_name ?? "");
  const [holder, setHolder] = useState(card?.holder_name ?? "");
  const [category, setCategory] = useState(card?.category ?? "");
  const [number, setNumber] = useState(card?.card_number ?? "");
  const [format, setFormat] = useState<BarcodeFormat | "auto">(card?.barcode_format ?? "auto");
  const [color, setColor] = useState<string | null>(card?.color ?? null);
  const [photo, setPhoto] = useState<CompressedCard | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [busy, onClose]);

  // show the saved photo when editing
  useEffect(() => {
    if (!card?.image_path) return;
    let cancelled = false;
    createClient().storage.from(LOYALTY_BUCKET).createSignedUrl(card.image_path, 3600).then(({ data }) => {
      if (!cancelled && data?.signedUrl) setPhotoUrl((u) => u ?? data.signedUrl);
    });
    return () => { cancelled = true; };
  }, [card?.image_path]);

  const chosen: BarcodeFormat = format === "auto" ? detectFormat(number) : format;
  const problem = number.trim() ? formatProblem(number, chosen) : null;
  const shownColor = color || (store.trim() ? colorForName(store) : CARD_COLORS[0]);
  const hasPhoto = !!photo || (!!card?.image_path && !removePhoto);
  const previewUrl = useMemo(() => (photo ? URL.createObjectURL(photo.file) : photoUrl), [photo, photoUrl]);
  useEffect(() => () => { if (photo && previewUrl) URL.revokeObjectURL(previewUrl); }, [photo, previewUrl]);

  const pick = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      setPhoto(await compressCardImage(file));
      setRemovePhoto(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not use that photo.");
    } finally {
      setBusy(false);
    }
  }, []);

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
      const saved = card
        ? await updateLoyaltyCard(supabase, userId, card, input, photo ? photo.file : removePhoto ? null : undefined)
        : await saveLoyaltyCard(supabase, userId, input, photo?.file);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the card.");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/70 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={card ? "Edit card" : "Add a card"} onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <form onSubmit={save} className="max-h-[100dvh] w-full max-w-lg space-y-4 overflow-y-auto rounded-t-2xl bg-card p-4 text-card-foreground shadow-2xl sm:max-h-full sm:rounded-2xl sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold">{card ? "Edit card" : "Add a card"}</h2>
          <Button type="button" variant="outline" size="icon" className="h-11 w-11" onClick={onClose} disabled={busy} aria-label="Close"><X className="h-5 w-5" /></Button>
        </div>

        {hasPhoto && previewUrl && (
          <div className="flex items-center gap-3 rounded-xl border bg-muted/30 p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="Card photo" className="h-[72px] w-28 shrink-0 rounded-lg object-cover" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Card photo added</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {photo ? `Shrunk to 800 px and saved as a light ${photo.file.type === "image/webp" ? "WebP" : "JPEG"}. Was ${formatBytes(photo.before)}, now ${formatBytes(photo.after)}.` : "Saved photo."}
              </p>
              <div className="mt-2 flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => fileInput.current?.click()} disabled={busy}>Replace photo</Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => { setPhoto(null); setPhotoUrl(null); setRemovePhoto(true); }} disabled={busy}>Remove</Button>
              </div>
            </div>
          </div>
        )}

        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files?.[0]); }}
          className={cn("flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-5 text-center transition-colors", drag ? "border-primary bg-primary/10" : "border-primary/40 bg-primary/5")}
        >
          <button type="button" onClick={() => fileInput.current?.click()} disabled={busy} className="flex min-h-11 items-center gap-2 text-sm font-semibold text-primary disabled:opacity-60">
            {busy && !store ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <ImageUp className="h-[18px] w-[18px]" />}
            Drop a card photo here, or choose a file
          </button>
          <p className="text-xs text-muted-foreground">JPG, PNG or WebP. Optional.</p>
          <input ref={fileInput} type="file" accept={LOYALTY_ACCEPT} className="sr-only" aria-label="Card photo" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
        </div>

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

        <div className="flex gap-2.5 pt-1">
          <Button type="button" variant="outline" className="h-11 flex-1" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" className="h-11 flex-[2]" disabled={busy || !!problem}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {card ? "Save changes" : "Save card"}
          </Button>
        </div>
      </form>
    </div>
  );
}

