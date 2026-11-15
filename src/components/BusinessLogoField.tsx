"use client";

import { useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { resizeLogo } from "@/lib/logo-image";
import { useBusinessLogo } from "@/lib/use-business-logo";
import { Button } from "@/components/ui/button";

/** Your business logo for reports. It is saved as soon as you choose it, stored privately with your account. */
export function BusinessLogoField() {
  const { url, path, loading, reload } = useBusinessLogo();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose(file: File | undefined) {
    if (!file) return;
    setBusy(true); setError(null);
    try {
      const { blob, ext } = await resizeLogo(file);
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in.");
      const next = `${user.id}/logo/logo-${Date.now()}.${ext}`;
      const up = await supabase.storage.from("receipts").upload(next, blob, { contentType: blob.type, upsert: false });
      if (up.error) throw up.error;
      const upd = await supabase.from("profiles").update({ business_logo_path: next }).eq("id", user.id);
      if (upd.error) {
        await supabase.storage.from("receipts").remove([next]).catch(() => {});
        throw new Error(/business_logo_path|schema cache|column/i.test(upd.error.message) ? "Logos are not set up yet. Run migration_report_logo.sql in the Supabase SQL Editor." : upd.error.message);
      }
      if (path) supabase.storage.from("receipts").remove([path]).catch(() => {});
      reload();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save the logo."); }
    finally { setBusy(false); if (input.current) input.current.value = ""; }
  }

  async function remove() {
    setBusy(true); setError(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in.");
      const upd = await supabase.from("profiles").update({ business_logo_path: null }).eq("id", user.id);
      if (upd.error) throw upd.error;
      if (path) supabase.storage.from("receipts").remove([path]).catch(() => {});
      reload();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not remove the logo."); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-2" data-testid="business-logo">
      <p className="text-sm font-medium" id="business-logo-label">Business logo</p>
      <div className="flex items-center gap-4 rounded-2xl border bg-muted/30 p-3">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border bg-card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {url ? <img src={url} alt="Your business logo" className="max-h-full max-w-full object-contain" data-testid="business-logo-img" /> : <ImagePlus className="h-6 w-6 text-muted-foreground" aria-hidden="true" />}
        </div>
        <p className="text-[12.5px] leading-snug text-muted-foreground">Shown at the top of your Excel and PDF reports, with your company name. PNG or JPG.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-labelledby="business-logo-label" onChange={(e) => choose(e.target.files?.[0])} data-testid="business-logo-input" />
        <Button type="button" variant="outline" disabled={busy || loading} onClick={() => input.current?.click()}><ImagePlus className="h-4 w-4" aria-hidden="true" />{path ? "Change logo" : "Add logo"}</Button>
        {path && <Button type="button" variant="outline" disabled={busy} onClick={remove} className="text-red-700 dark:text-red-300"><Trash2 className="h-4 w-4" aria-hidden="true" />Remove</Button>}
      </div>
      {error && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}
    </div>
  );
}
