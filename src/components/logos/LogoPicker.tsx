"use client";

import { useRef, useState } from "react";
import { Globe, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SubLogo } from "@/components/logos/SubLogo";
import { findLogo, logoFromFile } from "@/lib/logo-tile";
import { cleanDomain } from "@/lib/logo-match";

/**
 * A logo for something: a preview tile plus "Upload" and "Find from website". Used on the admin Logo library page.
 * It only picks a picture; the page saves it.
 */
export function LogoPicker({ name, logo, onLogo, website, onWebsite }: { name: string; logo: string | null; onLogo: (l: string | null) => void; website: string; onWebsite: (w: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [asking, setAsking] = useState(false);

  const upload = async (f: File | undefined) => {
    if (!f) return;
    setNote("");
    try { onLogo(await logoFromFile(f)); } catch (e) { setNote(e instanceof Error ? e.message : "This picture could not be processed."); }
    if (fileRef.current) fileRef.current.value = "";
  };
  const find = async () => {
    const d = cleanDomain(website);
    if (!d) return setNote("Enter a website like spotify.com.");
    setBusy(true); setNote("");
    const r = await findLogo(d);
    setBusy(false);
    if (r.logo) onLogo(r.logo); else setNote(r.error ?? "No logo found for that website.");
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <SubLogo logo={logo} name={name || "?"} className="h-14 w-14" />
        <div className="grid flex-1 grid-cols-2 gap-2">
          <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /> Upload logo</Button>
          <Button type="button" variant="outline" onClick={() => setAsking((a) => !a)} aria-expanded={asking}><Globe className="h-4 w-4" /> Find from website</Button>
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" aria-label="Choose a logo picture" onChange={(e) => void upload(e.target.files?.[0])} />
      </div>
      {asking && (
        <div className="flex gap-2">
          <Input value={website} onChange={(e) => onWebsite(e.target.value)} placeholder="spotify.com" inputMode="url" autoCapitalize="none" aria-label="Website" maxLength={200} />
          <Button type="button" onClick={() => void find()} disabled={busy} className="shrink-0">{busy ? "Looking…" : "Find"}</Button>
        </div>
      )}
      {logo && <button type="button" onClick={() => onLogo(null)} className="text-sm font-semibold text-muted-foreground underline">Remove logo</button>}
      {note && <p role="status" className="text-sm text-muted-foreground">{note}</p>}
    </div>
  );
}
