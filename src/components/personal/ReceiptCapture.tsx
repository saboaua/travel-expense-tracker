"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Upload, X, Loader2, ScrollText, ChevronRight } from "lucide-react";
import { compressReceiptImage } from "@/lib/compress-image";
import { ReceiptCropper } from "@/components/ReceiptCropper";
import { LongReceiptFlow } from "@/components/scan/LongReceiptFlow";
import { isJoinedReceipt } from "@/lib/long-receipt";

/** Camera/upload picker with optional crop, then compresses and hands the file to `onFile`. */
export function ReceiptCapture({
  preview,
  busy,
  busyLabel = "Reading receipt...",
  maxSide = 1600,
  onFile,
  onClear,
  incoming,
  onIncomingTaken,
}: {
  preview: string | null;
  busy: boolean;
  busyLabel?: string;
  maxSide?: number;
  onFile: (file: File, previewUrl: string) => void;
  onClear: () => void;
  /** A photo sent here from elsewhere (Scan on the dashboard): it goes to the crop step like a photo picked here. */
  incoming?: File | null;
  onIncomingTaken?: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<File | null>(null);
  const [longOpen, setLongOpen] = useState(false);

  useEffect(() => {
    if (!incoming) return;
    // A long receipt joined from parts is already ready: no crop step
    if (isJoinedReceipt(incoming)) void finish(incoming);
    else setPending(incoming);
    onIncomingTaken?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- takes each handed-over photo once
  }, [incoming]);

  const finish = async (file: File) => {
    setPending(null);
    let processed = file;
    try {
      processed = await compressReceiptImage(file, { maxSide });
    } catch {
      // keep as-is if compression fails
    }
    const reader = new FileReader();
    reader.onload = () => onFile(processed, reader.result as string);
    reader.readAsDataURL(processed);
  };

  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    e.target.value = "";
    if (!selected) return;
    setPending(selected);
  };

  return (
    <div>
      {preview ? (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Receipt preview" className="w-full rounded-lg border max-h-64 object-contain bg-muted" />
          <button
            type="button"
            onClick={() => {
              onClear();
              if (input.current) input.current.value = "";
            }}
            className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white"
            aria-label="Remove photo"
          >
            <X className="h-4 w-4" />
          </button>
          {busy && (
            <div className="absolute inset-0 bg-black/40 rounded-xl flex items-center justify-center">
              <div className="bg-white text-slate-900 rounded-xl px-4 py-3 flex items-center gap-2 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" /> {busyLabel}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => {
              input.current?.setAttribute("capture", "environment");
              input.current?.click();
            }}
            className="flex flex-col items-center justify-center gap-2 h-28 rounded-lg border-2 border-dashed border-primary/40 bg-primary/5"
          >
            <Camera className="h-7 w-7 text-primary" />
            <span className="text-sm font-medium text-primary">Take Photo</span>
          </button>
          <button
            type="button"
            onClick={() => {
              input.current?.removeAttribute("capture");
              input.current?.click();
            }}
            className="flex flex-col items-center justify-center gap-2 h-28 rounded-lg border-2 border-dashed"
          >
            <Upload className="h-7 w-7 text-muted-foreground" />
            <span className="text-sm font-medium">Upload</span>
          </button>
        </div>
      )}
      {!preview && (
        <button type="button" data-testid="long-receipt-link" onClick={() => setLongOpen(true)} className="mt-3 flex min-h-14 w-full items-center gap-3 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-left dark:border-violet-900 dark:bg-violet-950/30">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300"><ScrollText className="h-5 w-5" aria-hidden="true" /></span>
          <span className="min-w-0 flex-1"><span className="block text-[15px] font-bold text-violet-900 dark:text-violet-200">Long receipt?</span><span className="block text-[13px] text-violet-800 dark:text-violet-300">Take it in parts. We join them for you.</span></span>
          <ChevronRight className="h-5 w-5 shrink-0 text-violet-700 dark:text-violet-300" aria-hidden="true" />
        </button>
      )}
      {longOpen && <LongReceiptFlow onCancel={() => setLongOpen(false)} onDone={(f) => { setLongOpen(false); void finish(f); }} />}
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={handle} />

      {pending && (
        <ReceiptCropper
          file={pending}
          onDone={finish}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}