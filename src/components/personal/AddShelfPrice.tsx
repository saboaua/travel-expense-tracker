"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Camera, Check, Crosshair, Loader2, MapPin, Search, Users } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Money } from "@/components/ui/money";
import { PriceCheckForm } from "@/components/personal/PriceCheckForm";
import { useCountry } from "@/components/personal/use-country";
import { createClient } from "@/lib/supabase/client";
import { fetchAll } from "@/lib/personal/fetch-all";
import { useOnline } from "@/lib/use-online";
import { currencyOfCountry } from "@/lib/country";
import { type LatLng } from "@/lib/personal/basket";
import { distanceLabel, nearestShops, readShelfStatus, seenBy, SHELF_MESSAGE, shelfArgs, suggestedShop, type NearShop, type Shop } from "@/lib/personal/shelf-price";
import { scanShelfLabel, SHELF_SCAN_MESSAGE, type ShelfScanOutcome } from "@/lib/shelf-scan";
import { parseAmount } from "@/lib/personal/quick-spend";
import { storeKey as shopKey } from "@/lib/personal/community";

type Added = { product_key: string; product_name: string; size_label: string | null; currency: string; price: number; reporters: number };

/**
 * Add a price you see in a shop, for the community. Needs "Share my receipt prices" on (asked for here when it is off). The nearest shop is
 * found from the phone's position, used once and never sent or saved; the full list of shops only opens when searched.
 */
export function AddShelfPrice() {
  const online = useOnline();
  const cn = useCountry();
  const country = cn.country;
  const [sharing, setSharing] = useState<boolean | null>(null);
  const [setupMissing, setSetupMissing] = useState(false);
  const [mine, setMine] = useState(false); // "Not now": save privately with the older form
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [places, setPlaces] = useState<Shop[]>([]);
  const [me, setMe] = useState<LatLng | null>(null);
  const [geo, setGeo] = useState<"idle" | "asking" | "denied">("idle");
  const [shop, setShop] = useState<Shop | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [find, setFind] = useState("");

  const [product, setProduct] = useState("");
  const [size, setSize] = useState("");
  const [price, setPrice] = useState("");
  const [sale, setSale] = useState(false);
  const [check, setCheck] = useState(false); // the price is far from what others reported
  const [added, setAdded] = useState<Added[]>([]);
  const [saved, setSaved] = useState(false);
  const lastKey = useRef<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState(false);
  const [scanFail, setScanFail] = useState<Extract<ShelfScanOutcome, { ok: false }>["reason"] | null>(null);
  const [scanned, setScanned] = useState<{ cur: string | null } | null>(null); // filled from a photo: ask the shopper to check
  const [photo, setPhoto] = useState<string | null>(null);

  const currency = currencyOfCountry(country) ?? "AWG";

  useEffect(() => {
    (async () => {
      const sb = createClient();
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return;
      const { data, error } = await sb.from("profiles").select("share_prices").eq("id", session.user.id).single();
      if (error) { setSetupMissing(true); setSharing(false); return; }
      setSharing(data?.share_prices === true);
    })();
  }, []);

  useEffect(() => {
    if (!sharing) return;
    (async () => {
      try {
        const sb = createClient();
        const load = (withCountry: boolean) => fetchAll<{ id: string; name: string; lat: number; lng: number }>((a, b) => {
          const q = sb.from("supermarket_places").select("id, name, lat, lng");
          return (withCountry && country ? q.eq("country", country) : q).order("id").range(a, b);
        });
        const rows = await load(true).catch(() => load(false));
        setPlaces(rows.map((r) => ({ id: String(r.id), name: r.name, lat: r.lat, lng: r.lng })));
      } catch { setPlaces([]); }
    })();
  }, [sharing, country]);

  const locate = useCallback(() => {
    if (!navigator.geolocation) { setGeo("denied"); return; }
    setGeo("asking");
    navigator.geolocation.getCurrentPosition(
      (p) => { setMe({ lat: p.coords.latitude, lng: p.coords.longitude }); setGeo("idle"); },
      () => setGeo("denied"),
      { timeout: 8000, maximumAge: 5 * 60 * 1000 }
    );
  }, []);
  useEffect(() => {
    if (!sharing) return;
    navigator.permissions?.query({ name: "geolocation" }).then((s) => { if (s.state === "granted") locate(); }).catch(() => {});
  }, [sharing, locate]);

  const near = useMemo<NearShop[]>(() => (me ? nearestShops(me, places) : []), [me, places]);
  const here = useMemo(() => suggestedShop(near), [near]);
  const found = useMemo(() => {
    const q = find.trim().toLowerCase();
    return q.length < 2 ? [] : places.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 8);
  }, [find, places]);

  const turnOn = async () => {
    setBusy(true); setErr(null);
    const sb = createClient();
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { setBusy(false); return; }
    const { error } = await sb.from("profiles").update({ share_prices: true }).eq("id", session.user.id);
    setBusy(false);
    if (error) return setErr("Could not turn sharing on. Please try again.");
    setSharing(true);
  };

  const refreshAdded = useCallback(async (s: Shop) => {
    const r = await createClient().rpc("my_shelf_prices", { p_store_key: shopKey(s.name) });
    if (!r.error) setAdded(((r.data ?? []) as Added[]).map((x) => ({ ...x, price: Number(x.price) })));
  }, []);

  const save = async (force = false) => {
    if (!shop) return;
    setErr(null);
    const amt = parseAmount(price);
    if (!product.trim()) return setErr("What product is it?");
    if (amt == null) return setErr("Enter the price you see.");
    if (!online) return setErr("You are offline. Connect to share a price.");
    const args = shelfArgs({ shop: shop.name, product, size, price: amt, currency, country, sale }, force);
    if (!args) return setErr("Check the product and the price.");
    setBusy(true);
    const r = await createClient().rpc("share_shelf_price", args);
    setBusy(false);
    if (r.error) return setErr(/function|schema cache|does not exist/i.test(r.error.message) ? "Adding prices is not set up yet. Ask the admin to run migration_shelf_prices.sql." : "Could not save that. Please try again.");
    const status = readShelfStatus(r.data);
    if (status === "check") { setCheck(true); return; }
    if (status !== "ok") return setErr(SHELF_MESSAGE[status]);
    lastKey.current = args.p_product_key + (sale ? "|sale" : "");
    setCheck(false); setSaved(true);
    setProduct(""); setSize(""); setPrice(""); setSale(false); dropPhoto();
    await refreshAdded(shop);
  };

  const onPhoto = async (file: File | undefined) => {
    if (!file) return;
    setErr(null); setScanFail(null); setScanned(null); setSaved(false); setCheck(false);
    setPhoto((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(file); });
    setScanning(true);
    const out = await scanShelfLabel(file, currency);
    setScanning(false);
    if (!out.ok) { setScanFail(out.reason); return; }
    const sc = out.scan;
    if (sc.product) setProduct(sc.product);
    if (sc.price != null) setPrice(sc.price.toFixed(2));
    setSize(sc.size ?? "");
    setSale(sc.sale);
    setScanned({ cur: sc.usedCurrency });
  };
  const dropPhoto = () => { setPhoto((old) => { if (old) URL.revokeObjectURL(old); return null; }); setScanFail(null); setScanned(null); };

  const undo = async () => {
    if (!shop || !lastKey.current) return;
    setBusy(true);
    await createClient().rpc("undo_shelf_price", { p_store_key: shopKey(shop.name), p_product_key: lastKey.current });
    lastKey.current = null;
    await refreshAdded(shop);
    setBusy(false);
  };

  if (mine) return <PriceCheckForm />;
  const head = (
    <>
      <Link href="/personal/groceries" className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Groceries</Link>
      <h1 className="text-2xl font-bold">Add a price</h1>
      <p className="mt-1 text-sm text-muted-foreground">{shop && sharing ? `${shop.name}` : "Share a price you see in the shop"}</p>
    </>
  );
  const box = "mx-auto max-w-lg p-4 pb-28 md:p-8";

  if (sharing == null) return <div className={box}>{head}<div className="mt-4 h-40 animate-pulse rounded-2xl bg-muted" aria-hidden="true" /></div>;

  // Sharing is off: ask for it first
  if (!sharing) {
    return (
      <div className={box} data-testid="shelf-gate">
        {head}
        <div className="mt-4 space-y-3 rounded-2xl border bg-card p-4">
          <div className="flex items-center gap-2"><Users className="h-5 w-5 shrink-0 text-teal-700" aria-hidden="true" /><h2 className="text-lg font-bold leading-tight">Turn on community sharing to add prices</h2></div>
          <p className="text-sm leading-relaxed text-muted-foreground">Prices you add are shared with other shoppers, so sharing has to be on first. You can turn it off any time and delete what you shared.</p>
          <div className="space-y-1.5 text-sm">
            <p className="text-[13px] font-bold text-muted-foreground">What is shared</p>
            <p><span className="font-bold text-emerald-600">✓</span> Shop, product, size and price</p>
            <p><span className="font-bold text-emerald-600">✓</span> The month, never the day or time</p>
            <p><span className="font-bold text-red-600">✕</span> Your name, email or account</p>
            <p><span className="font-bold text-red-600">✕</span> Your position or any photo</p>
          </div>
          {err && <Alert>{err}</Alert>}
          {setupMissing && <Alert>Community prices are not set up yet. Ask the admin to run migration_shared_prices.sql.</Alert>}
          <Button type="button" onClick={turnOn} disabled={busy || setupMissing} className="h-12 w-full text-base" data-testid="shelf-turn-on">{busy ? "Turning on..." : "Turn on and continue"}</Button>
          <button type="button" onClick={() => setMine(true)} className="flex min-h-11 w-full items-center justify-center text-sm font-semibold text-muted-foreground" data-testid="shelf-not-now">Not now</button>
        </div>
        <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">After you turn it on, you go straight to the nearest shop. The same switch is in Profile, Community prices. &quot;Not now&quot; saves a price just for you.</p>
      </div>
    );
  }

  // Step 1: which shop
  if (!shop) {
    return (
      <div className={box} data-testid="shelf-shop">
        {head}
        {!choosing && here && (
          <div className="mt-4 rounded-2xl border-2 border-emerald-600 bg-card p-4" data-testid="shelf-here">
            <div className="flex items-center gap-3"><MapPin className="h-6 w-6 shrink-0 text-emerald-600" aria-hidden="true" /><div className="min-w-0 flex-1"><p className="text-[12.5px] text-muted-foreground">You are at</p><p className="truncate text-lg font-extrabold">{here.name}</p><p className="text-[12.5px] text-muted-foreground">{distanceLabel(here.km)} from you</p></div></div>
            <Button type="button" onClick={() => setShop(here)} className="mt-3 h-12 w-full text-base" data-testid="shelf-here-yes">Yes, add prices here</Button>
            <button type="button" onClick={() => setChoosing(true)} className="flex min-h-11 w-full items-center justify-center text-sm font-bold text-primary" data-testid="shelf-not-here">Not here? Choose another shop</button>
          </div>
        )}
        {(choosing || !here) && (
          <div className="mt-4 space-y-3">
            {!me && (
              <div className="rounded-2xl border bg-card p-4 text-center">
                <p className="text-sm text-muted-foreground">{geo === "denied" ? "Allow location for this site in your browser settings, or search a shop by name." : "Find the shops closest to you. Your position is used once and is never saved or shared."}</p>
                <Button type="button" onClick={locate} disabled={geo === "asking"} className="mt-3 gap-2" data-testid="shelf-locate"><Crosshair className="h-4 w-4" aria-hidden="true" />{geo === "asking" ? "Finding you…" : "Find shops near me"}</Button>
              </div>
            )}
            {me && near.length > 0 && (
              <div className="rounded-2xl border bg-card px-4 py-1" data-testid="shelf-near">
                <p className="pt-3 text-[13px] font-bold text-muted-foreground">The {near.length} closest to you</p>
                {near.map((s) => (
                  <button key={s.id} type="button" onClick={() => setShop(s)} className="flex min-h-14 w-full items-center gap-3 border-t text-left first:border-t-0">
                    <span className="min-w-0 flex-1 truncate text-[15px] font-bold">{s.name}</span><span className="text-[13px] text-muted-foreground">{distanceLabel(s.km)}</span>
                  </button>
                ))}
              </div>
            )}
            {me && near.length === 0 && <Alert>No shops are listed near you yet. Search a shop by name.</Alert>}
            <div className="flex items-center gap-2 rounded-2xl border bg-card px-3.5"><Search className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" /><Input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Search another shop" aria-label="Search another shop" className="h-12 border-0 px-0 shadow-none focus-visible:ring-0" data-testid="shelf-find" /></div>
            {found.length > 0 && (
              <div className="rounded-2xl border bg-card px-4 py-1" data-testid="shelf-found">
                {found.map((s) => <button key={s.id} type="button" onClick={() => setShop(s)} className="flex min-h-12 w-full items-center border-t text-left text-[15px] font-semibold first:border-t-0">{s.name}</button>)}
              </div>
            )}
            <p className="text-[13px] text-muted-foreground">The full list of shops only opens when you search.</p>
          </div>
        )}
        <p className="mt-4 text-[13px] text-muted-foreground">{!online ? "You are offline: a price can only be shared when you are online. " : ""}<button type="button" onClick={() => setMine(true)} className="min-h-11 font-semibold text-primary">Save a price just for me</button></p>
      </div>
    );
  }

  // Step 2: the price
  const label = "mb-1.5 block text-[13px] font-bold text-foreground/80";
  return (
    <div className={box} data-testid="shelf-form">
      <button type="button" onClick={() => { setShop(null); setSaved(false); setAdded([]); setCheck(false); setErr(null); }} className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Change shop</button>
      <h1 className="text-2xl font-bold">Add a price</h1>
      <p className="mt-1 text-sm text-muted-foreground" data-testid="shelf-shop-name">{shop.name}</p>

      {saved && (
        <div className="mt-4 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200" data-testid="shelf-saved"><Check className="h-5 w-5 shrink-0" aria-hidden="true" />Price saved. Thank you, other shoppers will see it.</div>
      )}

      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden="true" data-testid="shelf-file" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; void onPhoto(f); }} />
      {!photo && (
        <>
          <button type="button" onClick={() => fileRef.current?.click()} className="mt-4 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-400 bg-card text-[15px] font-bold text-primary" data-testid="shelf-scan"><Camera className="h-5 w-5" aria-hidden="true" />Scan the shelf label</button>
          <p className="mt-1.5 text-center text-[12.5px] text-muted-foreground">or fill in the boxes below by hand</p>
        </>
      )}
      {photo && (
        <div className="mt-4 space-y-3" data-testid="shelf-photo">
          <div className="relative h-28 overflow-hidden rounded-2xl bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo} alt="Your photo of the shelf label" className="h-full w-full object-cover" />
            {!scanning && <button type="button" onClick={() => fileRef.current?.click()} className="absolute right-2.5 top-2.5 min-h-9 rounded-full bg-slate-900/80 px-3 text-xs font-semibold text-white" data-testid="shelf-retake">Retake</button>}
          </div>
          {scanning && <div className="flex items-center gap-2.5 rounded-2xl border border-blue-200 bg-blue-50 px-3.5 py-3 text-sm font-semibold text-blue-900 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200" role="status" data-testid="shelf-reading"><Loader2 className="h-[18px] w-[18px] animate-spin" aria-hidden="true" />Reading the label…</div>}
          {scanning && <p className="text-center text-[12.5px] text-muted-foreground">Your photo is only read. It is not saved or shared.</p>}
          {scanFail && (
            <div className="space-y-2" data-testid="shelf-scan-failed">
              <Alert>{SHELF_SCAN_MESSAGE[scanFail]}</Alert>
              {(scanFail === "unreadable" || scanFail === "unavailable") && <Button type="button" onClick={() => fileRef.current?.click()} className="h-12 w-full">Take another photo</Button>}
              <Button type="button" variant="outline" onClick={dropPhoto} className="h-12 w-full" data-testid="shelf-type-instead">Type it in instead</Button>
            </div>
          )}
          {scanned && (
            <div className="flex gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-[13.5px] leading-snug text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100" data-testid="shelf-scan-check"><b className="shrink-0">Check</b><span>Filled from your photo. Make sure each box matches the label.{scanned.cur === currency ? ` The ${currency} price was used.` : ""}</span></div>
          )}
        </div>
      )}

      <form onSubmit={(e) => { e.preventDefault(); save(false); }} className="mt-4 space-y-4 rounded-2xl border bg-card p-4">
        <div>
          <label htmlFor="sp-product" className={label}>Product</label>
          <Input id="sp-product" value={product} onChange={(e) => { setProduct(e.target.value); setCheck(false); }} placeholder="Smartfood popcorn white cheddar" maxLength={160} className="h-12 text-base" data-testid="shelf-product" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="sp-price" className={label}>Price ({currency})</label>
            <Input id="sp-price" inputMode="decimal" autoComplete="off" value={price} onChange={(e) => { setPrice(e.target.value); setCheck(false); }} placeholder="0.00" className="h-12 text-lg font-bold tabular-nums" data-testid="shelf-price" />
          </div>
          <div>
            <label htmlFor="sp-size" className={label}>Size <span className="font-normal text-muted-foreground">(optional)</span></label>
            <Input id="sp-size" value={size} onChange={(e) => setSize(e.target.value)} placeholder="6.75 oz" maxLength={40} className="h-12" data-testid="shelf-size" />
          </div>
        </div>
        <div className="flex min-h-12 items-center gap-3">
          <span className="min-w-0 flex-1 text-[15px] font-semibold">This is a sale price<span className="block text-[12.5px] font-normal text-muted-foreground">Sale prices are kept apart from the normal price</span></span>
          <button type="button" role="switch" aria-checked={sale} onClick={() => setSale(!sale)} data-testid="shelf-sale" className={`relative h-7 w-12 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${sale ? "bg-primary" : "bg-slate-300 dark:bg-slate-600"}`}>
            <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${sale ? "left-6" : "left-1"}`} /><span className="sr-only">{sale ? "On" : "Off"}</span>
          </button>
        </div>
        {check && (
          <Alert data-testid="shelf-check">
            <p className="font-semibold">That price is far from what other shoppers reported.</p>
            <p className="mt-1">Please look at the shelf label again. If it is right, save it anyway.</p>
            <Button type="button" variant="outline" onClick={() => save(true)} disabled={busy} className="mt-2" data-testid="shelf-save-anyway">Save anyway</Button>
          </Alert>
        )}
        {err && <Alert>{err}</Alert>}
        <Button type="submit" disabled={busy || check} className="h-12 w-full text-base" data-testid="shelf-save">{busy ? "Saving..." : "Save price"}</Button>
      </form>

      {added.length > 0 && (
        <div className="mt-4 rounded-2xl border bg-card p-4" data-testid="shelf-added">
          <p className="text-[15px] font-extrabold">Added here today · {added.length}</p>
          <ul className="mt-1 divide-y">
            {added.map((a) => (
              <li key={a.product_key} className="flex min-h-12 items-center gap-2 py-1.5 text-sm" data-testid="shelf-added-row">
                <span className="min-w-0 flex-1"><b className="block truncate font-semibold">{a.product_name}{a.size_label ? ` ${a.size_label}` : ""}</b><span className="text-[12.5px] text-muted-foreground">{seenBy(a.reporters)}</span></span>
                <b className="tabular-nums"><Money amount={a.price} currency={a.currency} /></b>
              </li>
            ))}
          </ul>
          {lastKey.current && <button type="button" onClick={undo} disabled={busy} className="mt-1 flex min-h-11 w-full items-center justify-center text-sm font-semibold text-muted-foreground" data-testid="shelf-undo">Undo the last price</button>}
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">A price counts as Confirmed once 3 shoppers saw about the same price. Nobody is named.</p>
        </div>
      )}
    </div>
  );
}
