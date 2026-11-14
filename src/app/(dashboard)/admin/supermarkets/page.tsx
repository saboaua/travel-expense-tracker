"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, MapPin } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAccess } from "@/lib/use-access";
import { formatDate } from "@/lib/utils";

type Preview = { total: number; kept: number; skipped: { noName: number; badGps: number; duplicate: number; example: number }; sample: { name: string; lat: number; lng: number }[] };
type Status = { rows: number; importedAt: string | null };

export default function AdminSupermarketsPage() {
  const { role, loaded } = useAccess();
  const [status, setStatus] = useState<Status | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    fetch("/api/admin/supermarket-import").then((r) => r.json()).then((d) => { if (d.error) setError(d.error); else setStatus(d); }).catch(() => setError("Could not load the saved list."));
  }, []);
  useEffect(() => { if (role === "admin") load(); }, [role, load]);

  const send = async (f: File, mode: "preview" | "import") => {
    const body = new FormData();
    body.set("file", f);
    body.set("mode", mode);
    const res = await fetch("/api/admin/supermarket-import", { method: "POST", body });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Something went wrong.");
    return data;
  };
  const reset = () => { setFile(null); setPreview(null); if (input.current) input.current.value = ""; };
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
      setDone(`Imported ${d.kept.toLocaleString()} supermarket places${d.removed ? ` (${d.removed.toLocaleString()} old ones removed)` : ""}.`);
      reset(); load();
    } catch (e) { setError(e instanceof Error ? e.message : "Import failed."); } finally { setBusy(false); }
  };

  if (loaded && role !== "admin") return <div className="p-4 md:p-8"><Alert>Only an admin can import supermarket places.</Alert></div>;
  const sk = preview?.skipped;
  return (
    <div className="p-4 md:p-8 pb-24 max-w-2xl mx-auto space-y-6">
      <PageHeader title="Supermarket places" description={<>Shops with their GPS point, shown on the Best store map for everyone. A receipt shows at the shop with the same name.</>} />
      {error && <Alert>{error}</Alert>}
      {done && <Alert variant="success">{done}</Alert>}

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-lg">Saved list</CardTitle></CardHeader>
        <CardContent className="text-sm" data-testid="places-status">
          {!status ? "Loading…" : status.rows === 0 ? "Nothing imported yet." : <>{status.rows.toLocaleString()} places · imported {formatDate(status.importedAt!.slice(0, 10))}</>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-lg"><MapPin className="h-5 w-5" aria-hidden="true" />How to do it</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>Download the example file and open it in Excel.</li>
            <li>One row per shop: <b>Name</b> (as printed on the receipt), <b>Latitude</b>, <b>Longitude</b>. Address is optional. A chain with several shops gets one row each.</li>
            <li>Aruba is about 12.5 and −70.0. Latitude is the first number. Use a dot and keep the minus sign.</li>
            <li>Get the numbers from <b>openstreetmap.org</b> (right-click the shop, Show address) or from your phone&apos;s GPS while standing at the shop.</li>
            <li>Delete the two EXAMPLE rows (they are skipped anyway), save as .xlsx or .csv, and choose it below.</li>
          </ol>
          <p className="text-xs text-muted-foreground">Do not copy coordinates from Google Maps: its terms do not allow keeping them. Importing replaces the whole saved list, so keep every shop in the file.</p>
          <a href="/api/admin/supermarket-import?template=1" download className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 text-sm font-semibold hover:bg-muted" data-testid="places-template"><Download className="h-4 w-4" aria-hidden="true" />Download the example file</a>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-lg">Import a file</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <input ref={input} type="file" accept=".xlsx,.csv" aria-label="Supermarket places file" data-testid="places-file" disabled={busy} onChange={(e) => choose(e.target.files?.[0] ?? null)} className="block w-full text-sm file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-lg file:border file:bg-background file:px-4 file:text-sm file:font-semibold" />
          {busy && !preview && <p className="text-sm text-muted-foreground">Reading the file…</p>}
          {preview && sk && (
            <div className="space-y-3" data-testid="places-preview">
              <dl className="divide-y rounded-xl border text-sm">
                {[["Rows in the file", preview.total], ["Will be imported", preview.kept], ["Skipped, no name", sk.noName], ["Skipped, GPS missing or wrong", sk.badGps], ["Skipped, same shop twice", sk.duplicate], ["Skipped, EXAMPLE rows", sk.example]].map(([l, v], i) => (
                  <div key={String(l)} className={`flex justify-between px-3 py-2 ${i === 1 ? "font-bold" : ""}`}><dt>{l}</dt><dd className="tabular-nums">{Number(v).toLocaleString()}</dd></div>
                ))}
              </dl>
              <ul className="text-sm text-muted-foreground">{preview.sample.map((s) => <li key={`${s.name}${s.lat}${s.lng}`}>{s.name} · {s.lat}, {s.lng}</li>)}</ul>
              <div className="flex gap-2">
                <Button variant="outline" className="h-11" disabled={busy} onClick={reset}>Cancel</Button>
                <Button className="h-11" disabled={busy} onClick={doImport} data-testid="places-import">{busy ? "Importing…" : `Import ${preview.kept.toLocaleString()}`}</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
