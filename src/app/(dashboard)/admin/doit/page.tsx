"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAccess } from "@/lib/use-access";
import { formatDate } from "@/lib/utils";

type Preview = { total: number; kept: number; skipped: { soldOut: number; closeout: number; hidden: number; noPrice: number; noName: number }; sample: { name: string; size: string | null; price: number }[] };
type Status = { rows: number; importedAt: string | null };

export default function AdminDoitPage() {
  const { role, loaded } = useAccess();
  const [status, setStatus] = useState<Status | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    fetch("/api/admin/doit-import").then((r) => r.json()).then((d) => { if (d.error) setError(d.error); else setStatus(d); }).catch(() => setError("Could not load the saved list."));
  }, []);
  useEffect(() => { if (role === "admin") load(); }, [role, load]);

  const send = async (f: File, mode: "preview" | "import") => {
    const body = new FormData();
    body.set("file", f);
    body.set("mode", mode);
    const res = await fetch("/api/admin/doit-import", { method: "POST", body });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Something went wrong.");
    return data;
  };

  const choose = async (f: File | null) => {
    setFile(f); setPreview(null); setError(null); setDone(null);
    if (!f) return;
    setBusy(true);
    try { setPreview(await send(f, "preview")); } catch (e) { setError(e instanceof Error ? e.message : "Could not read that file."); setFile(null); } finally { setBusy(false); }
  };

  const doImport = async () => {
    if (!file) return;
    setBusy(true); setError(null);
    try {
      const d = await send(file, "import");
      setDone(`Imported ${d.kept.toLocaleString()} items${d.removed ? ` (${d.removed.toLocaleString()} old ones removed)` : ""}.`);
      setFile(null); setPreview(null); if (input.current) input.current.value = "";
      load();
    } catch (e) { setError(e instanceof Error ? e.message : "Import failed."); } finally { setBusy(false); }
  };

  if (loaded && role !== "admin") return <div className="p-4 md:p-8"><Alert>Only an admin can import prices.</Alert></div>;

  const age = status?.importedAt ? Math.floor((Date.now() - Date.parse(status.importedAt)) / 86400000) : null;
  const sk = preview?.skipped;
  return (
    <div className="p-4 md:p-8 pb-24 max-w-2xl mx-auto space-y-6">
      <PageHeader title="Do it Aruba prices" description={<>Imported from the exported Excel file, not read live. Shown in the Price tracker as an online store.</>} />
      {error && <Alert>{error}</Alert>}
      {done && <Alert variant="success">{done}</Alert>}

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-lg">Saved list</CardTitle></CardHeader>
        <CardContent className="text-sm" data-testid="doit-status">
          {!status ? "Loading…" : status.rows === 0 ? "Nothing imported yet." : (
            <>{status.rows.toLocaleString()} items · imported {formatDate(status.importedAt!.slice(0, 10))}
              {age !== null && age > 30 && <b className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">Old, import a newer file</b>}</>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-lg"><FileSpreadsheet className="h-5 w-5" aria-hidden="true" />Import a file</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">Choose the Do it export (.xlsx). Sold-out, hidden and closeout items are skipped. Importing replaces the saved list.</p>
          <input ref={input} type="file" accept=".xlsx" aria-label="Do it Excel file" data-testid="doit-file" disabled={busy} onChange={(e) => choose(e.target.files?.[0] ?? null)} className="block w-full text-sm file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-lg file:border file:bg-background file:px-4 file:text-sm file:font-semibold" />
          {busy && !preview && <p className="text-sm text-muted-foreground">Reading the file…</p>}
          {preview && sk && (
            <div className="space-y-3" data-testid="doit-preview">
              <dl className="divide-y rounded-xl border text-sm">
                {[["Items in the file", preview.total], ["Will be imported", preview.kept], ["Skipped, sold out", sk.soldOut], ["Skipped, closeout", sk.closeout], ["Skipped, hidden or blocked", sk.hidden], ["Skipped, no price or name", sk.noPrice + sk.noName]].map(([l, v], i) => (
                  <div key={String(l)} className={`flex justify-between px-3 py-2 ${i === 1 ? "font-bold" : ""}`}><dt>{l}</dt><dd className="tabular-nums">{Number(v).toLocaleString()}</dd></div>
                ))}
              </dl>
              <ul className="text-sm text-muted-foreground">{preview.sample.map((s) => <li key={s.name}>{s.name}{s.size ? ` (${s.size})` : ""} · AWG {s.price.toFixed(2)}</li>)}</ul>
              <p className="text-xs text-muted-foreground">Prices are AWG including VAT, as in the file.</p>
              <div className="flex gap-2">
                <Button variant="outline" className="h-11" disabled={busy} onClick={() => { setFile(null); setPreview(null); if (input.current) input.current.value = ""; }}>Cancel</Button>
                <Button className="h-11" disabled={busy} onClick={doImport} data-testid="doit-import">{busy ? "Importing…" : `Import ${preview.kept.toLocaleString()}`}</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
