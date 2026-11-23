"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import { BackLink, PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CountryField } from "@/components/admin/CountryField";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAccess } from "@/lib/use-access";
import { formatDate } from "@/lib/utils";
import { PAGE_WIDTH } from "@/components/layout/PageShell";

type Preview = {
  total: number; kept: number; seenBefore: number; fresh: number;
  skipped: { missing: number; badPrice: number; duplicate: number; example: number; farOff: number };
  sample: { store: string; product: string; currency: string; price: number }[];
};
type Status = { added: number; uploads: number; lastAt: string | null };

export default function AdminCommunityPricesPage() {
  const { role, loaded } = useAccess();
  const [status, setStatus] = useState<Status | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [country, setCountry] = useState("AW");
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    fetch("/api/admin/community-import").then((r) => r.json()).then((d) => { if (d.error) setError(d.error); else setStatus(d); }).catch(() => setError("Could not load the totals."));
  }, []);
  useEffect(() => { if (role === "admin") load(); }, [role, load]);

  const send = async (f: File, mode: "preview" | "import") => {
    const body = new FormData();
    body.set("file", f);
    body.set("mode", mode);
    body.set("country", country);
    const res = await fetch("/api/admin/community-import", { method: "POST", body });
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
      setDone(`${d.added.toLocaleString()} prices added.${d.seenBefore ? ` ${d.seenBefore.toLocaleString()} of them were a price that was already there, now seen by one more shopper.` : ""} Nothing was removed.`);
      reset(); load();
    } catch (e) { setError(e instanceof Error ? e.message : "Import failed."); } finally { setBusy(false); }
  };

  if (loaded && role !== "admin") return <div className="p-4 md:p-8"><Alert>Only an admin can import community prices.</Alert></div>;
  const sk = preview?.skipped;
  return (
    <div className={`${PAGE_WIDTH.form} p-4 md:p-8 pb-24 space-y-6`}>
      <BackLink href="/admin/supermarkets">Supermarkets</BackLink>
      <PageHeader title="Community prices import" description="Add prices from receipts you typed into Excel. People see them next to the prices from the app." />
      {error && <Alert>{error}</Alert>}
      {done && <Alert variant="success"><span data-testid="prices-done">{done}</span></Alert>}

      <Card><CardContent className="p-4"><CountryField value={country} onChange={(c) => { setCountry(c); reset(); }} disabled={busy} /></CardContent></Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-xs font-bold uppercase tracking-wide text-muted-foreground">So far</CardTitle></CardHeader>
        <CardContent data-testid="prices-status">
          {!status ? <p className="text-sm">Loading…</p> : (
            <p className="flex flex-wrap items-baseline gap-x-2"><span className="text-3xl font-extrabold tabular-nums">{status.added.toLocaleString()}</span><span className="text-sm text-muted-foreground">prices added by uploads{status.lastAt ? ` · last on ${formatDate(status.lastAt.slice(0, 10))}` : ""}</span></p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-lg">How to do it</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>Download the template and open it in Excel.</li>
            <li>One row per price: <b>Store</b>, <b>Product</b> (with the size), <b>Price</b>, <b>Currency</b>. Unit only for items sold by weight.</li>
            <li>Delete the EXAMPLE rows, save as .xlsx or .csv, and choose it below.</li>
          </ol>
          <a href="/api/admin/community-import?template=1" download className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 text-sm font-semibold hover:bg-muted" data-testid="prices-template"><Download className="h-4 w-4" aria-hidden="true" />Download the template</a>
          <p className="text-xs text-muted-foreground">Importing only adds. Nothing already there is changed or removed. Each upload counts as one shopper, like one more person. A price shows right away and gets a Confirmed badge once 3 shoppers agree.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-lg">Import a file</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <input ref={input} type="file" accept=".xlsx,.csv" aria-label="Community prices file" data-testid="prices-file" disabled={busy} onChange={(e) => choose(e.target.files?.[0] ?? null)} className="block w-full text-sm file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-lg file:border file:bg-background file:px-4 file:text-sm file:font-semibold" />
          {busy && !preview && <p className="text-sm text-muted-foreground">Reading the file…</p>}
          {preview && sk && (
            <div className="space-y-3" data-testid="prices-preview">
              <dl className="divide-y rounded-xl border text-sm">
                {[["Rows in the file", preview.total], ["Will be added", preview.kept], ["Already there, counted as one more shopper", preview.seenBefore], ["New prices", preview.fresh], ["Skipped, far from the usual price for that product", sk.farOff], ["Skipped, price or currency missing or wrong", sk.badPrice], ["Skipped, no store or product", sk.missing], ["Skipped, same row twice in the file", sk.duplicate], ["Skipped, EXAMPLE rows", sk.example]].map(([l, v], i) => (
                  <div key={String(l)} className={`flex justify-between gap-3 px-3 py-2 ${i === 1 ? "font-bold" : ""}`}><dt>{l}</dt><dd className="tabular-nums">{Number(v).toLocaleString()}</dd></div>
                ))}
              </dl>
              <ul className="text-sm text-muted-foreground">{preview.sample.map((s) => <li key={`${s.store}${s.product}`}>{s.store} · {s.product} · {s.currency} {s.price.toFixed(2)}</li>)}</ul>
              <div className="flex gap-2">
                <Button variant="outline" className="h-11" disabled={busy} onClick={reset}>Cancel</Button>
                <Button className="h-11" disabled={busy} onClick={doImport} data-testid="prices-import">{busy ? "Importing…" : `Import ${preview.kept.toLocaleString()}`}</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
