"use client";

import { useBrand } from "@/lib/use-brand";
import { useEffect, useRef, useState } from "react";
import { Download, Share2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { tierOf } from "@/lib/personal/badges";
import { drawBadgeCard, shareFileName, shareTitle } from "@/lib/personal/badge-share";
import { firstNameOf, inviteUrl } from "@/lib/invite";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

/** Share a badge: a picture made on the phone (badge and count only), sent through the phone's own share menu. */
export function BadgeShare({ level, total, onClose }: { level: number; total: number; onClose: () => void }) {
  const { appName } = useBrand();
  const t = tierOf(level);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const [first, setFirst] = useState<string>("");
  const [code, setCode] = useState<string | null>(null);
  const [useName, setUseName] = useState(false);
  const [useLink, setUseLink] = useState(false);
  const [src, setSrc] = useState<string>("");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (user) { const { data: p } = await sb.from("profiles").select("first_name, full_name").eq("id", user.id).maybeSingle(); if (p) setFirst(firstNameOf(p.first_name as string | null, p.full_name as string | null)); }
      const r = await sb.rpc("my_invite");
      const row = (Array.isArray(r.data) ? r.data[0] : r.data) as { code?: string } | undefined;
      if (!r.error && row?.code) setCode(row.code);
    })().catch(() => {});
  }, []);

  const link = useLink && code && typeof window !== "undefined" ? inviteUrl(window.location.origin, code) : null;
  useEffect(() => {
    const c = canvas.current ?? document.createElement("canvas");
    canvas.current = c;
    drawBadgeCard(c, { level, total, firstName: useName ? first : null, link, appName });
    setSrc(c.toDataURL("image/png"));
  }, [level, total, useName, first, link, appName]);

  if (!t) return null;
  const blob = () => new Promise<Blob | null>((res) => { if (canvas.current) canvas.current.toBlob((b) => res(b), "image/png"); else res(null); });
  const save = async () => {
    const b = await blob(); if (!b) return;
    const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = shareFileName(t.name, appName); document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000); setMsg("Saved. Find it in your photos or downloads.");
  };
  const share = async () => {
    setMsg(null);
    const b = await blob(); if (!b) return;
    const file = new File([b], shareFileName(t.name, appName), { type: "image/png" });
    try {
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], text: link ? `${shareTitle(t.name, useName ? first : null)} ${link}` : undefined });
      else await save();
    } catch (e) { if ((e as Error)?.name !== "AbortError") setMsg("Could not open the share menu. Use Save image instead."); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/60 sm:items-center" role="dialog" aria-modal="true" aria-label="Share your badge" data-testid="badge-share">
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-4 pb-6 dark:bg-slate-900 sm:rounded-3xl">
        <div className="flex items-start justify-between gap-2">
          <div><b className="text-lg">Share your badge</b><p className="text-sm text-muted-foreground">Only the badge and the count are in the picture. No stores, no prices.</p></div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-muted"><X className="h-5 w-5" aria-hidden="true" /></button>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {src && <img src={src} alt={`${shareTitle(t.name, useName ? first : null)}, ${total} prices shared`} className="mx-auto my-3 w-56 rounded-2xl shadow-lg" data-testid="badge-share-preview" />}
        <div className="divide-y">
          <div className="flex items-center justify-between gap-3 py-2.5"><span><b className="block text-[15px]">Add my first name</b><span className="text-xs text-muted-foreground">{first ? `Shows "${first} is a ${t.name}"` : "No first name on your profile"}</span></span><Switch label="Add my first name" checked={useName} onChange={setUseName} disabled={!first} /></div>
          {code && <div className="flex items-center justify-between gap-3 py-2.5"><span><b className="block text-[15px]">Add my invite link</b><span className="text-xs text-muted-foreground">Friends who sign up through it are counted as your recommendations</span></span><Switch label="Add my invite link" checked={useLink} onChange={setUseLink} /></div>}
        </div>
        {msg && <p className="mt-2 text-sm text-muted-foreground" role="status">{msg}</p>}
        <div className="mt-3 space-y-2">
          <Button className="h-12 w-full text-base" onClick={share} data-testid="badge-share-go"><Share2 className="h-5 w-5" aria-hidden="true" /> Share</Button>
          <Button variant="outline" className="h-12 w-full text-base" onClick={save} data-testid="badge-share-save"><Download className="h-5 w-5" aria-hidden="true" /> Save image</Button>
        </div>
      </div>
    </div>
  );
}
