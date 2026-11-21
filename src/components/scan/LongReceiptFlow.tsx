"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Check, ChevronLeft, CircleAlert, Image as ImageIcon, Layers, Loader2, X } from "lucide-react";
import { compressReceiptImage } from "@/lib/compress-image";
import { joinParts, MAX_PARTS, type JoinResult } from "@/lib/long-receipt";

type Part = { file: File; url: string };
type Joined = Extract<JoinResult, { ok: true }>;

/**
 * A receipt too long for one photo: take it in parts from the top down, then join them into one image.
 * Only the joined image is handed back; the parts are thrown away.
 */
export function LongReceiptFlow({ onDone, onCancel }: { onDone: (file: File) => void; onCancel: () => void }) {
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const retakeAt = useRef<number | null>(null);
  const [parts, setParts] = useState<Part[]>([]);
  const [picked, setPicked] = useState<number | null>(null);
  const [step, setStep] = useState<"parts" | "joined" | "nomatch">("parts");
  const [busy, setBusy] = useState<"adding" | "joining" | null>(null);
  const [joined, setJoined] = useState<Joined | null>(null);
  const [between, setBetween] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const urls = useRef<string[]>([]);
  useEffect(() => () => { urls.current.forEach((u) => URL.revokeObjectURL(u)); }, []);
  const track = (u: string) => { urls.current.push(u); return u; };

  const addFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setError(null);
    setBusy("adding");
    const made: Part[] = [];
    for (const f of files) {
      if (!f.type.startsWith("image/")) continue;
      const small = await compressReceiptImage(f).catch(() => f);
      made.push({ file: small, url: track(URL.createObjectURL(small)) });
    }
    setBusy(null);
    if (made.length === 0) return setError("Choose photos of the receipt. Other files cannot be joined.");
    const at = retakeAt.current;
    retakeAt.current = null;
    setPicked(null);
    setJoined(null);
    setStep("parts");
    setParts((cur) => {
      if (at != null && cur[at]) return cur.map((p, i) => (i === at ? made[0] : p));
      return [...cur, ...made].slice(0, MAX_PARTS);
    });
    if (at == null && parts.length + made.length > MAX_PARTS) setError(`Up to ${MAX_PARTS} parts. The rest were left out.`);
  };

  const onInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    void addFiles(files);
  };

  const take = (at: number | null) => { retakeAt.current = at; camera.current?.click(); };
  const remove = (i: number) => { setParts((cur) => cur.filter((_, k) => k !== i)); setPicked(null); setJoined(null); setStep("parts"); };

  const join = async (force = false) => {
    setBusy("joining");
    setError(null);
    const r = await joinParts(parts.map((p) => p.file), { force });
    setBusy(null);
    if (r.ok) { setJoined(r); setStep("joined"); return; }
    if (r.reason === "no-match") { setBetween(r.between); setStep("nomatch"); return; }
    setError("These photos could not be joined. Try taking them again.");
  };

  const next = parts.length + 1;
  const full = parts.length >= MAX_PARTS;
  const primary = "inline-flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-xl bg-primary text-base font-bold text-primary-foreground disabled:opacity-70";
  const secondary = "inline-flex min-h-12 w-full items-center justify-center gap-2.5 rounded-xl border bg-card text-[15px] font-semibold disabled:opacity-70";

  const strip = (
    <div className="flex items-start gap-3 overflow-x-auto pb-1 pl-2 pt-2">
      {parts.map((p, i) => (
        <button key={p.url} type="button" data-testid="lr-part" onClick={() => setPicked(picked === i ? null : i)} aria-label={`Part ${i + 1}`} className={`relative shrink-0 rounded-md ${picked === i ? "ring-2 ring-primary ring-offset-2 ring-offset-card" : ""}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.url} alt="" className="h-36 w-24 rounded-md border bg-muted object-cover object-top" />
          <span className="absolute -left-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{i + 1}</span>
        </button>
      ))}
      {!full && step === "parts" && (
        <div className="flex h-36 w-24 shrink-0 items-center justify-center rounded-md border-2 border-dashed px-2 text-center text-[13px] font-semibold text-muted-foreground">Part {next} next</div>
      )}
    </div>
  );

  return (
    <div className="app-frame fixed inset-0 z-[60] flex flex-col overflow-y-auto bg-background pt-[env(safe-area-inset-top)]" role="dialog" aria-modal="true" aria-label="Long receipt" data-testid="long-receipt">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 p-4">
        <button type="button" onClick={step === "parts" ? onCancel : () => setStep("parts")} className="-ml-1.5 flex min-h-11 w-fit items-center gap-1 text-[15px] font-semibold text-primary">
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />{step === "parts" ? "Cancel" : "Parts"}
        </button>

        {step === "parts" && (
          <>
            <div>
              <h1 className="text-2xl font-extrabold leading-tight">Long receipt</h1>
              <p className="text-sm text-muted-foreground">{parts.length === 0 ? "Take it from the top, in parts." : `${parts.length} ${parts.length === 1 ? "part" : "parts"} taken.`}</p>
            </div>
            {!full && (
              <section className="rounded-2xl border bg-card p-4">
                <h2 className="mb-2 text-[15px] font-bold">Part {next}</h2>
                <ol className="space-y-2 text-sm leading-relaxed text-muted-foreground">
                  <li><b className="text-foreground">1.</b> Slide the camera <b className="text-foreground">down</b>, the same way you read.</li>
                  <li><b className="text-foreground">2.</b> Keep the <b className="text-foreground">last 2 or 3 lines</b> of the last part in the photo. That is how we match them.</li>
                  <li><b className="text-foreground">3.</b> Keep the receipt flat and the edges in view.</li>
                </ol>
              </section>
            )}
            {parts.length > 0 && (
              <section className="rounded-2xl border bg-card p-4">
                <h2 className="mb-1 text-xs font-extrabold tracking-wide text-muted-foreground">YOUR PARTS</h2>
                {strip}
                {picked != null ? (
                  <div className="mt-3 flex gap-2">
                    <button type="button" onClick={() => take(picked)} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border text-sm font-semibold"><Camera className="h-4 w-4" aria-hidden="true" />Retake part {picked + 1}</button>
                    <button type="button" data-testid="lr-remove" onClick={() => remove(picked)} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border text-sm font-semibold text-red-600"><X className="h-4 w-4" aria-hidden="true" />Remove</button>
                  </div>
                ) : (
                  <p className="mt-3 text-[12.5px] text-muted-foreground">Tap a part to retake or remove it.</p>
                )}
              </section>
            )}
            {error && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">{error}</p>}
            <div className="mt-auto flex flex-col gap-2.5 pb-2">
              {parts.length >= 2 && (
                <button type="button" data-testid="lr-join" disabled={!!busy} onClick={() => join()} className={primary}>
                  {busy === "joining" ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Layers className="h-5 w-5" aria-hidden="true" />}
                  {busy === "joining" ? "Joining..." : "Join the parts"}
                </button>
              )}
              {!full && (
                <button type="button" data-testid="lr-take" disabled={!!busy} onClick={() => take(null)} className={parts.length >= 2 ? secondary : primary}>
                  {busy === "adding" ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Camera className="h-5 w-5" aria-hidden="true" />}
                  {parts.length >= 2 ? "Add another part" : `Take part ${next}`}
                </button>
              )}
              {!full && (
                <button type="button" disabled={!!busy} onClick={() => gallery.current?.click()} className={secondary}>
                  <ImageIcon className="h-5 w-5" aria-hidden="true" />Choose from photos
                </button>
              )}
              <p className="px-1 text-xs text-muted-foreground">Up to {MAX_PARTS} parts. You can also choose several photos at once, in order.</p>
            </div>
          </>
        )}

        {step === "joined" && joined && (
          <>
            <div>
              <h1 className="text-2xl font-extrabold leading-tight">One receipt</h1>
              <p className="text-sm text-muted-foreground">Check it reads from top to bottom.</p>
            </div>
            <div className="max-h-[52vh] overflow-y-auto rounded-2xl border bg-card p-3">
              <div className="relative mx-auto w-full max-w-[260px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={joined.preview} alt="The joined receipt" data-testid="lr-joined-image" className="block w-full border bg-white" />
                {joined.joins.map((y, i) => (
                  <div key={i} className="pointer-events-none absolute inset-x-0 flex items-center gap-2" style={{ top: `${(y / joined.height) * 100}%`, transform: "translateY(-50%)" }}>
                    <span className="h-0 flex-1 border-t-2 border-dashed border-blue-400" />
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-extrabold text-blue-700">Joined here</span>
                    <span className="h-0 flex-1 border-t-2 border-dashed border-blue-400" />
                  </div>
                ))}
              </div>
            </div>
            <p className="flex gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm leading-snug text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200" data-testid="lr-joined">
              <Check className="mt-0.5 h-[18px] w-[18px] shrink-0" aria-hidden="true" />
              <span><b>Joined {parts.length} parts into 1 image.</b> Nothing repeats at the joins. The parts themselves are not saved, only this one image.</span>
            </p>
            <div className="mt-auto flex gap-2.5 pb-2">
              <button type="button" onClick={() => setStep("parts")} className="inline-flex min-h-[50px] flex-1 items-center justify-center gap-2 rounded-xl border bg-card text-[15px] font-semibold"><Camera className="h-4 w-4" aria-hidden="true" />Retake a part</button>
              <button type="button" data-testid="lr-done" onClick={() => onDone(joined.file)} className="inline-flex min-h-[50px] flex-[1.3] items-center justify-center gap-2 rounded-xl bg-primary text-[15px] font-bold text-primary-foreground"><Check className="h-5 w-5" aria-hidden="true" />Looks right</button>
            </div>
            <p className="px-1 text-xs text-muted-foreground">Next you see the amounts read from it, like any other receipt.</p>
          </>
        )}

        {step === "nomatch" && (
          <>
            <div>
              <h1 className="text-2xl font-extrabold leading-tight">Long receipt</h1>
              <p className="text-sm text-muted-foreground">{parts.length} parts taken.</p>
            </div>
            <section className="rounded-2xl border bg-card p-4">{strip}</section>
            <p role="alert" data-testid="lr-nomatch" className="flex gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm leading-snug text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
              <CircleAlert className="mt-0.5 h-[18px] w-[18px] shrink-0" aria-hidden="true" />
              <span><b>We could not match part {between + 1} and part {between + 2}.</b> No lines are the same in both, so something between them may be missing.</span>
            </p>
            <p className="px-1 text-sm leading-relaxed text-muted-foreground">Retake part {between + 2} starting a few lines higher, so the last lines of part {between + 1} show again.</p>
            <div className="mt-auto flex flex-col gap-2.5 pb-2">
              <button type="button" onClick={() => take(between + 1)} className={primary}><Camera className="h-5 w-5" aria-hidden="true" />Retake part {between + 2}</button>
              <button type="button" data-testid="lr-force" disabled={!!busy} onClick={() => join(true)} className={secondary}>
                {busy === "joining" ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Layers className="h-5 w-5" aria-hidden="true" />}
                Join anyway, one under the other
              </button>
            </div>
          </>
        )}
      </div>
      <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" data-testid="lr-camera-input" onChange={onInput} />
      <input ref={gallery} type="file" accept="image/*" multiple className="hidden" data-testid="lr-gallery-input" onChange={onInput} />
    </div>
  );
}
