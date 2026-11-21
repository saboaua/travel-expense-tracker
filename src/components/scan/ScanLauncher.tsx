"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useReceiptTypes } from "@/lib/use-receipt-types";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Camera, ChevronDown, ChevronUp, Loader2, Plus, Upload } from "lucide-react";
import { compressReceiptImage } from "@/lib/compress-image";
import { getLastScanChoice, setLastScanChoice, stashQuickScan } from "@/lib/quick-scan";
import { currentPlace } from "@/lib/scan-place";
import { takeSharedFile } from "@/lib/share-target";
import { suggestDestination, typeScanOptions, withQuery, type HomePlace, type ScanOption } from "@/lib/scan-destination";
import { ScanSheet } from "@/components/scan/ScanSheet";
import { ScanModeSheet } from "@/components/scan/ScanModeSheet";
import { LongReceiptFlow } from "@/components/scan/LongReceiptFlow";
import { todayISO } from "@/lib/utils";

type Pending = { file: File; options: ScanOption[]; pick: string; reason: string | null; preview: string | null };

const localDate = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * Scan (camera) and Upload (gallery / files) in the welcome card, for business and personal.
 * When the app is sure where the receipt goes it opens the form straight away (the form has a Change button);
 * otherwise it shows one sheet with the best guess already selected.
 */
export function ScanLauncher({ options: baseOptions, home, showNewTrip }: { options: ScanOption[]; home: HomePlace | null; showNewTrip: boolean }) {
  const router = useRouter();
  const { types, reload: reloadTypes } = useReceiptTypes();
  // Your receipt types are only offered where Groceries is (Personal is on)
  const personal = baseOptions.some((o) => o.kind === "grocery");
  const options = useMemo(() => (personal ? [...baseOptions, ...typeScanOptions(types)] : baseOptions), [baseOptions, personal, types]);
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"scan" | "upload" | "save" | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [mode, setMode] = useState<"menu" | "long" | null>(null);

  // Something shared to the app from another app (Android share sheet): handled like an Upload, once
  const shared = useRef(false);
  useEffect(() => {
    if (shared.current) return;
    const flag = new URLSearchParams(window.location.search).get("shared");
    if (!flag) return;
    shared.current = true;
    window.history.replaceState(null, "", window.location.pathname);
    if (flag !== "1") return setNotice("Nothing usable was shared. Share a photo of a receipt, or a PDF.");
    void takeSharedFile().then((file) => (file ? processFile("upload", file) : setNotice("Nothing usable was shared. Share a photo of a receipt, or a PDF.")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Free the preview URL when the sheet closes
  useEffect(() => () => { if (pending?.preview) URL.revokeObjectURL(pending.preview); }, [pending]);

  const go = async (file: File, opt: ScanOption, reason: string | null) => {
    setBusy("save");
    setLastScanChoice(opt.key);
    const stored = await stashQuickScan(file, opt.key, reason);
    router.push(stored ? withQuery(opt.href, "quick=1") : opt.href);
  };

  const handle = async (mode: "scan" | "upload", e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    e.target.value = "";
    if (!selected) return;
    await processFile(mode, selected);
  };

  /** A photo or PDF, from the camera, the gallery or another app's share sheet: it goes the same way. */
  const processFile = async (mode: "scan" | "upload", selected: File) => {
    setNotice(null);
    setBusy(mode);

    const isPdf = selected.type === "application/pdf" || /\.pdf$/i.test(selected.name);
    if (isPdf) {
      // Receipts are read from photos; a PDF can only be kept as a document
      const doc = options.find((o) => o.kind === "document");
      setBusy(null);
      if (!doc) return setNotice("PDF receipts are not supported yet. Upload a photo of the receipt instead.");
      return setPending({ file: selected, options: [doc], pick: doc.key, reason: "PDFs are saved as documents", preview: null });
    }

    // Look up the place while the photo is being prepared, so the person never waits on it twice
    const [placeResult, processed] = await Promise.all([
      mode === "scan" ? currentPlace() : Promise.resolve(null),
      compressReceiptImage(selected).catch(() => selected),
    ]);
    await choose(processed, mode, placeResult, mode === "upload" ? localDate(selected.lastModified) : null);
  };

  /** A joined long receipt is already prepared; it goes the same way as a scanned photo. */
  const longDone = async (file: File) => {
    setMode(null);
    setNotice(null);
    setBusy("scan");
    await choose(file, "scan", await currentPlace(), null);
  };

  const choose = async (processed: File, mode: "scan" | "upload", placeResult: Awaited<ReturnType<typeof currentPlace>> | null, photoDate: string | null) => {
    const sug = suggestDestination({
      mode,
      options,
      place: placeResult,
      home,
      photoDate,
      today: todayISO(),
      last: getLastScanChoice(),
    });
    if (!sug.pick) {
      setBusy(null);
      return setNotice("Create a trip or open Personal first, then scan your receipts into it.");
    }
    if (sug.confident) return go(processed, sug.pick, sug.reason);
    setBusy(null);
    setPending({ file: processed, options, pick: sug.pick.key, reason: sug.reason, preview: URL.createObjectURL(processed) });
  };

  const chosen = pending?.options.find((o) => o.key === pending.pick);
  const canScan = options.some((o) => o.kind !== "document");
  const canUpload = options.length > 0;
  if (!canUpload && !showNewTrip) return null;

  const btn = "inline-flex h-12 items-center justify-center gap-2 rounded-xl text-[15px] font-semibold transition-colors disabled:opacity-70";
  return (
    <>
      <div className={`mt-4 grid gap-3 md:max-w-xl ${showNewTrip ? "grid-cols-[1.25fr_1fr] md:grid-cols-3" : "grid-cols-2"}`}>
        {canScan && (
          <div className="flex h-12 overflow-hidden rounded-xl bg-primary text-primary-foreground shadow-sm">
            <button type="button" disabled={!!busy} onClick={() => camera.current?.click()} className="inline-flex flex-1 items-center justify-center gap-2 text-[15px] font-semibold transition-colors hover:bg-primary/90 disabled:opacity-70">
              {busy === "scan" ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Camera className="h-5 w-5" aria-hidden="true" />}
              Scan
            </button>
            <button type="button" data-testid="scan-more" disabled={!!busy} aria-haspopup="dialog" aria-expanded={mode === "menu"} aria-label="More options" onClick={() => setMode("menu")} className="flex w-11 items-center justify-center border-l border-white/35 transition-colors hover:bg-primary/90 disabled:opacity-70">
              {mode === "menu" ? <ChevronUp className="h-[18px] w-[18px]" aria-hidden="true" /> : <ChevronDown className="h-[18px] w-[18px]" aria-hidden="true" />}
            </button>
          </div>
        )}
        {canUpload && (
          <button type="button" disabled={!!busy} onClick={() => gallery.current?.click()} className={`${btn} bg-primary/10 text-primary hover:bg-primary/15`}>
            {busy === "upload" ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Upload className="h-5 w-5" aria-hidden="true" />}
            Upload
          </button>
        )}
        {showNewTrip && (
          <Link href="/trips/new" className={`${btn} col-span-2 bg-primary/10 text-primary hover:bg-primary/15 md:col-span-1`}>
            <Plus className="h-5 w-5" aria-hidden="true" />
            New Trip
          </Link>
        )}
      </div>

      {notice && (
        <p role="status" className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
          {notice}
        </p>
      )}
      <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handle("scan", e)} />
      <input ref={gallery} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => handle("upload", e)} />

      {mode === "menu" && <ScanModeSheet onClose={() => setMode(null)} onScan={() => { setMode(null); camera.current?.click(); }} onLong={() => setMode("long")} />}
      {mode === "long" && <LongReceiptFlow onCancel={() => setMode(null)} onDone={longDone} />}

      {pending && (
        <ScanSheet
          options={pending.options.length === 1 && pending.options[0].kind === "document" ? pending.options : options}
          types={personal ? types : undefined}
          onTypesChanged={reloadTypes}
          selected={pending.pick}
          onSelect={(k) => setPending({ ...pending, pick: k })}
          reason={pending.reason}
          preview={pending.preview}
          busy={busy === "save"}
          onConfirm={() => chosen && go(pending.file, chosen, pending.pick === pending.options[0]?.key ? pending.reason : null)}
          onClose={() => setPending(null)}
        />
      )}
    </>
  );
}
