"use client";

import { useRef, useState } from "react";
import { Camera, Upload, X, Loader2 } from "lucide-react";
import { compressReceiptImage } from "@/lib/compress-image";
import { ReceiptCropper } from "@/components/ReceiptCropper";

/** Camera/upload picker with optional crop, then compresses and hands the file to `onFile`. */
export function ReceiptCapture({
  preview,
  busy,
  busyLabel = "Reading receipt...",
  maxSide = 1600,
  onFile,
  onClear,
}: {
  preview: string | null;
  busy: boolean;
  busyLabel?: string;
  maxSide?: number;
  onFile: (file: File, previewUrl: string) => void;
  onClear: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<File | null>(null);

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