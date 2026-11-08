"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Camera, Loader2, Plus, Upload } from "lucide-react";
import { compressReceiptImage } from "@/lib/compress-image";
import { getLastScanChoice, setLastScanChoice, stashQuickScan } from "@/lib/quick-scan";
import { currentPlace } from "@/lib/scan-place";
import { suggestDestination, type HomePlace, type ScanOption } from "@/lib/scan-destination";
import { ScanSheet } from "@/components/scan/ScanSheet";
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
export function ScanLauncher({ options, home, showNewTrip }: { options: ScanOption[]; home: HomePlace | null; showNewTrip: boolean }) {
  const router = useRouter();
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"scan" | "upload" | "save" | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Free the preview URL when the sheet closes
  useEffect(() => () => { if (pending?.preview) URL.revokeObjectURL(pending.preview); }, [pending]);

  const go = async (file: File, opt: ScanOption, reason: string | null) => {
    setBusy("save");
    setLastScanChoice(opt.key);
    const stored = await stashQuickScan(file, opt.key, reason);
    router.push(`${opt.href}${stored ? "?quick=1" : ""}`);
  };

  const handle = async (mode: "scan" | "upload", e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    e.target.value = "";
    if (!selected) return;
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
    const sug = suggestDestination({
      mode,
      options,
      place: placeResult,
      home,
      photoDate: mode === "upload" ? localDate(selected.lastModified) : null,
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
      <div className={`mt-4 grid gap-3 md:max-w-xl ${showNewTrip ? "grid-cols-3" : "grid-cols-2"}`}>
        {canScan && (
          <button type="button" disabled={!!busy} onClick={() => camera.current?.click()} className={`${btn} bg-primary text-primary-foreground shadow-sm hover:bg-primary/90`}>
            {busy === "scan" ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Camera className="h-5 w-5" aria-hidden="true" />}
            Scan
          </button>
        )}
        {canUpload && (
          <button type="button" disabled={!!busy} onClick={() => gallery.current?.click()} className={`${btn} bg-primary/10 text-primary hover:bg-primary/15`}>
            {busy === "upload" ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Upload className="h-5 w-5" aria-hidden="true" />}
            Upload
          </button>
        )}
        {showNewTrip && (
          <Link href="/trips/new" className={`${btn} bg-primary/10 text-primary hover:bg-primary/15`}>
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

      {pending && (
        <ScanSheet
          options={pending.options}
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
