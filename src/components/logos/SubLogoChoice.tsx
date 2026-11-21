"use client";

import { useEffect, useRef, useState } from "react";
import { Globe, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SubLogo } from "@/components/logos/SubLogo";
import { findLogo, logoFromFile } from "@/lib/logo-tile";
import { cleanDomain, matchLogo, type LibraryLogo } from "@/lib/logo-match";
import { cn } from "@/lib/utils";

type Pick = "library" | "default" | "own";

/**
 * The logo part of the Add / Edit subscription form.
 * When the admin's library has a logo for the name, three choices are offered (use it, keep the default icon, upload your own).
 * When it does not, the default icon is used, and the person can add a website to look for a logo or upload one.
 */
export function SubLogoChoice({ name, library, logo, website, isNew, onChange }: {
  name: string; library: LibraryLogo[]; logo: string | null; website: string; isNew: boolean;
  onChange: (v: { logo?: string | null; website?: string }) => void;
}) {
  const match = matchLogo(name, library);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pick, setPick] = useState<Pick | null>(null); // null until the person chooses
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const startLogo = useRef(logo);

  // A new subscription whose name matches the library starts with that logo chosen. When the name stops matching, a library logo goes away again.
  const matchId = match?.id ?? null;
  useEffect(() => {
    if (match && pick === null && isNew && !startLogo.current) onChange({ logo: match.logo });
    if (!match && logo && library.some((l) => l.logo === logo) && pick !== "own") onChange({ logo: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  const selected: Pick = pick ?? (match && logo === match.logo ? "library" : logo ? "own" : "default");

  const upload = async (f: File | undefined) => {
    if (!f) return;
    setNote("");
    try { onChange({ logo: await logoFromFile(f) }); setPick("own"); } catch (e) { setNote(e instanceof Error ? e.message : "This picture could not be processed."); }
    if (fileRef.current) fileRef.current.value = "";
  };
  const find = async () => {
    const d = cleanDomain(website);
    if (!d) return setNote("Enter a website like spotify.com.");
    setBusy(true); setNote("");
    const r = await findLogo(d);
    setBusy(false);
    if (r.logo) { onChange({ logo: r.logo, website: d }); setPick("own"); setNote("Logo found."); } else setNote(r.error ?? "No logo found for that website.");
  };

  const fileInput = <input ref={fileRef} type="file" accept="image/*" className="hidden" aria-label="Choose your own logo" onChange={(e) => void upload(e.target.files?.[0])} />;

  if (match) {
    const options: { id: Pick; label: string; sub?: string }[] = [
      { id: "library", label: "Use this logo" },
      { id: "default", label: "Keep the default icon" },
      { id: "own", label: "Upload my own", sub: "From your photos or files" },
    ];
    return (
      <div className="space-y-2" data-testid="logo-match">
        <div className="flex items-center gap-3 rounded-2xl bg-muted/60 p-3">
          <SubLogo logo={match.logo} name={match.name} className="h-11 w-11" />
          <div><p className="text-sm font-bold">We have a logo for {match.name}</p><p className="text-xs text-muted-foreground">Pick what to show.</p></div>
        </div>
        <div role="radiogroup" aria-label="Logo" className="space-y-2">
          {options.map((o) => (
            <button key={o.id} type="button" role="radio" aria-checked={selected === o.id} data-testid={`logo-choice-${o.id}`}
              onClick={() => { if (o.id === "own") { fileRef.current?.click(); return; } setPick(o.id); onChange({ logo: o.id === "library" ? match.logo : null }); }}
              className={cn("flex min-h-12 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left", selected === o.id ? "border-primary bg-primary/5" : "bg-card")}>
              <span className={cn("h-5 w-5 shrink-0 rounded-full border-2", selected === o.id ? "border-[6px] border-primary" : "border-input")} aria-hidden="true" />
              <span><span className="block text-sm font-semibold">{o.label}</span>{o.sub && <span className="block text-xs text-muted-foreground">{o.sub}</span>}</span>
            </button>
          ))}
        </div>
        {selected === "own" && logo && <div className="flex items-center gap-2 text-sm text-muted-foreground"><SubLogo logo={logo} name={name} /> Your own logo</div>}
        {note && <p role="status" className="text-sm text-muted-foreground">{note}</p>}
        {fileInput}
      </div>
    );
  }

  return (
    <div className="space-y-2" data-testid="logo-nomatch">
      <div className="flex items-center gap-3 rounded-2xl bg-muted/60 p-3">
        <SubLogo logo={logo} name={name || "?"} className="h-11 w-11" />
        <div><p className="text-sm font-bold">{logo ? "Logo" : "No logo in our library"}</p><p className="text-xs text-muted-foreground">{logo ? "Shown before this subscription." : "The default icon is used."}</p></div>
      </div>
      <label className="flex flex-col gap-1.5 text-sm font-medium">Website (optional)
        <div className="flex gap-2">
          <Input value={website} onChange={(e) => onChange({ website: e.target.value })} placeholder="aruba-water.com" inputMode="url" autoCapitalize="none" maxLength={200} />
          <Button type="button" variant="outline" onClick={() => void find()} disabled={busy || !website.trim()} className="shrink-0"><Globe className="h-4 w-4" /> {busy ? "Looking…" : "Find logo"}</Button>
        </div>
        <span className="text-xs font-normal text-muted-foreground">Add one and we try to find its logo.</span>
      </label>
      <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} className="w-full"><Upload className="h-4 w-4" /> Upload my own logo</Button>
      {logo && <button type="button" onClick={() => { onChange({ logo: null }); setPick("default"); }} className="text-sm font-semibold text-muted-foreground underline">Remove logo</button>}
      {note && <p role="status" className="text-sm text-muted-foreground">{note}</p>}
      {fileInput}
    </div>
  );
}
