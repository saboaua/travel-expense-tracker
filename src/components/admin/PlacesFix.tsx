"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Check, CircleAlert, MapPin, Plus, Search, Trash2, X } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Select } from "@/components/ui/select";
import { CATEGORIES, DEFAULT_CATEGORY, categoryLabel, isCategory, type CategoryId } from "@/lib/personal/store-categories";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/ui/confirm";
import { splitGps } from "@/lib/personal/supermarket-import";
import { readPoint, type PlaceFilter, type PlaceView } from "@/lib/personal/places-fix";
import { cn } from "@/lib/utils";

const FixMap = dynamic(() => import("@/components/admin/FixMap"), { ssr: false, loading: () => <div className="h-64 w-full animate-pulse rounded-xl border bg-muted" aria-label="Loading map" /> });

type List = { categoriesNeeded?: boolean; total: number; matches: number; shown: number; counts: { fixed: number; outside: number; same: number }; places: PlaceView[]; setupNeeded?: boolean };
const FILTERS: { id: PlaceFilter; label: string }[] = [{ id: "all", label: "All" }, { id: "fixed", label: "Fixed by hand" }, { id: "outside", label: "Outside Aruba" }, { id: "same", label: "Same point twice" }];

/** Admin: search the saved places, see which look wrong, move a pin or remove a place. */
export function PlacesFix({ onChanged, country = "AW" }: { onChanged?: () => void; country?: string }) {
  const confirm = useConfirm();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<PlaceFilter>("all");
  const [list, setList] = useState<List | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [edit, setEdit] = useState<PlaceView | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/admin/supermarket-places?filter=${filter}&country=${country}&q=${encodeURIComponent(q)}`, { cache: "no-store" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error || "Could not load the places."); return; }
      setError(null); setList(d);
    } catch { setError("Could not load the places."); }
  }, [q, filter, country]);
  useEffect(() => { const t = setTimeout(load, q ? 250 : 0); return () => clearTimeout(t); }, [load, q]);

  const remove = async (p: PlaceView) => {
    if (!(await confirm({ title: "Remove this place?", message: `${p.name} will disappear from the Best store map for everyone. Receipts that name this shop are not changed. A later import will not bring it back.`, confirmLabel: "Remove", cancelLabel: "Keep it", destructive: true }))) return;
    setError(null); setNotice(null);
    const r = await fetch("/api/admin/supermarket-places", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: p.id }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return setError(d.error || "Could not remove it.");
    setNotice(`${p.name} was removed.`); load(); onChanged?.();
  };

  return (
    <div className="space-y-4" data-testid="places-fix">
        {error && <Alert>{error}</Alert>}
        {notice && <Alert variant="success">{notice}</Alert>}
        {list?.categoriesNeeded && !list.setupNeeded && <Alert>Run supabase/migration_directory_categories.sql in the Supabase SQL Editor to add places and categories. Until then every place is a supermarket.</Alert>}
        {list?.setupNeeded && <Alert>Run supabase/migration_places_fix.sql in the Supabase SQL Editor to fix or remove places.</Alert>}
        {edit ? (
          <EditPlace key={edit.id} place={edit} onClose={() => setEdit(null)} onSaved={(n) => { setEdit(null); setNotice(`${n} was fixed.`); load(); onChanged?.(); }} />
        ) : (
          <>
            <Button className="min-h-[50px] w-full" onClick={() => { setNotice(null); setAdding(true); }} data-testid="place-add"><Plus className="h-5 w-5" aria-hidden="true" />Add a place</Button>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or address" aria-label="Search places" className="min-h-[50px] pl-10" data-testid="places-search" />
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Show">
              {FILTERS.map((f) => {
                const n = f.id === "fixed" ? list?.counts.fixed : f.id === "outside" ? list?.counts.outside : f.id === "same" ? list?.counts.same : null;
                return <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)} data-testid={`places-filter-${f.id}`} className={cn("min-h-9 rounded-full px-3.5 text-sm font-bold", filter === f.id ? "bg-primary text-primary-foreground" : "bg-muted text-foreground")}>{f.label}{n ? ` ${n}` : ""}</button>;
              })}
            </div>
            {!list ? <p className="text-sm text-muted-foreground">Loading…</p> : list.places.length === 0 ? <p className="text-sm text-muted-foreground" data-testid="places-empty">{list.total === 0 ? "No places yet. Import a file first." : "No place matches."}</p> : (
              <ul className="divide-y" data-testid="places-list">
                {list.places.map((p) => (
                  <li key={p.id} className="py-3.5" data-testid="place-row">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-extrabold">{p.name}</p>
                        {p.address && <p className="text-[13px] text-muted-foreground">{p.address}</p>}
                        <p className="mt-0.5 text-[13px] tabular-nums">{p.lat}, {p.lng}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11.5px] font-extrabold text-muted-foreground" data-testid="place-category">{categoryLabel(p.category)}</span>
                      {p.added ? <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11.5px] font-extrabold text-amber-900 dark:bg-amber-950 dark:text-amber-200" data-testid="place-added">Added by hand</span> : p.fixed && <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-[11.5px] font-extrabold text-blue-800 dark:bg-blue-950 dark:text-blue-200" data-testid="place-fixed">Fixed by hand</span>}
                    </div>
                    {p.flag && <p className="mt-1.5 flex items-center gap-1.5 text-[13px] text-amber-700 dark:text-amber-300" data-testid={`place-flag-${p.flag}`}><CircleAlert className="h-4 w-4" aria-hidden="true" />{p.flag === "outside" ? "This point is outside Aruba" : `Same point as ${p.sameAs}`}</p>}
                    <div className="mt-2.5 flex gap-2">
                      <Button variant="outline" className="min-h-11" onClick={() => { setNotice(null); setEdit(p); }} data-testid="place-fix"><MapPin className="h-4 w-4" aria-hidden="true" />Fix location</Button>
                      <Button variant="outline" className="min-h-11 border-red-200 text-red-700 hover:bg-red-50" onClick={() => remove(p)} data-testid="place-remove"><Trash2 className="h-4 w-4" aria-hidden="true" />Remove</Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {list && list.matches > 0 && <p className="text-center text-[13px] text-muted-foreground" data-testid="places-count">Showing {list.shown} of {list.matches}{list.matches !== list.total ? ` (${list.total} in all)` : ""}</p>}
          </>
        )}
      {adding && <AddPlace country={country} onClose={() => setAdding(false)} onSaved={(n) => { setAdding(false); setNotice(`${n} was added.`); load(); onChanged?.(); }} />}
    </div>
  );
}

function EditPlace({ place, onClose, onSaved }: { place: PlaceView; onClose: () => void; onSaved: (name: string) => void }) {
  const [lat, setLat] = useState(String(place.lat));
  const [lng, setLng] = useState(String(place.lng));
  const [name, setName] = useState(place.name);
  const [address, setAddress] = useState(place.address ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pt = readPoint(lat, lng);
  const point = "error" in pt ? null : pt;

  // Pasting "12.54, -70.02" into either box fills both
  const typed = (which: "lat" | "lng", v: string) => {
    const both = splitGps(v);
    const t = v.trim();
    if (both && (/[;\s]/.test(t) || (t.match(/\./g) ?? []).length >= 2 || /,-/.test(t))) { setLat(String(both.lat)); setLng(String(both.lng)); return; } // "12,5" alone is one number with a comma, not two
    (which === "lat" ? setLat : setLng)(v);
  };
  const save = async () => {
    setBusy(true); setError(null);
    const r = await fetch("/api/admin/supermarket-places", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: place.id, name, address, lat, lng }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(d.error || "Could not save.");
    onSaved(name.trim());
  };
  return (
    <div className="space-y-4" data-testid="place-edit">
      <p className="font-extrabold">{place.name}</p>
      {place.flag === "outside" && <Alert>The saved point is outside Aruba. Move the pin to the shop.</Alert>}
      {error && <Alert>{error}</Alert>}
      <FixMap saved={{ lat: place.lat, lng: place.lng }} point={point} onPick={(p) => { setLat(p.lat.toFixed(6)); setLng(p.lng.toFixed(6)); }} />
      <p className="text-center text-[13px] text-muted-foreground">Tap the map or drag the pin. The grey dot is the saved point.</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><label htmlFor="fix-lat" className="text-sm font-semibold">Latitude</label><Input id="fix-lat" inputMode="decimal" value={lat} onChange={(e) => typed("lat", e.target.value)} /></div>
        <div className="space-y-1.5"><label htmlFor="fix-lng" className="text-sm font-semibold">Longitude</label><Input id="fix-lng" inputMode="decimal" value={lng} onChange={(e) => typed("lng", e.target.value)} /></div>
      </div>
      {"error" in pt && <p className="text-[13px] text-red-700" role="alert">{pt.error}</p>}
      <p className="text-[13px] leading-relaxed text-muted-foreground">You can also paste both numbers together, like 12.5412, -70.0268. Use openstreetmap.org or your phone GPS, not Google Maps.</p>
      <div className="space-y-1.5"><label htmlFor="fix-name" className="text-sm font-semibold">Name</label><Input id="fix-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} /></div>
      <div className="space-y-1.5"><label htmlFor="fix-address" className="text-sm font-semibold">Address (optional)</label><Input id="fix-address" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={200} /></div>
      <Button className="min-h-[52px] w-full" onClick={save} disabled={busy || !point || !name.trim()} data-testid="place-save"><Check className="h-5 w-5" aria-hidden="true" />{busy ? "Saving…" : "Save location"}</Button>
      <Button variant="outline" className="min-h-[52px] w-full" onClick={onClose} disabled={busy}><X className="h-5 w-5" aria-hidden="true" />Cancel</Button>
    </div>
  );
}

/** Admin: add a place by hand. Tap the map or drag the pin, name it, pick the category. It is kept when a new list is imported. */
function AddPlace({ country, onClose, onSaved }: { country: string; onClose: () => void; onSaved: (name: string) => void }) {
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState<CategoryId>(DEFAULT_CATEGORY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pt = readPoint(lat, lng);
  const point = "error" in pt ? null : pt;
  const save = async () => {
    setBusy(true); setError(null);
    const r = await fetch("/api/admin/supermarket-places", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, lat, lng, category, country }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(d.error || "Could not add it.");
    onSaved(name.trim());
  };
  return (
    <BottomSheet title="Add a place" onClose={onClose} testId="place-add-sheet" tall>
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <FixMap point={point} onPick={(p) => { setLat(p.lat.toFixed(6)); setLng(p.lng.toFixed(6)); }} />
        <p className="text-center text-[13px] text-muted-foreground">Tap the map or drag the pin to the shop.</p>
        <div className="space-y-1.5"><label htmlFor="add-name" className="text-sm font-semibold">Name, as printed on the receipt</label><Input id="add-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} /></div>
        <div className="space-y-1.5">
          <label htmlFor="add-category" className="text-sm font-semibold">Category</label>
          <Select id="add-category" className="h-12" value={category} onChange={(e) => isCategory(e.target.value) && setCategory(e.target.value)}>
            {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </Select>
        </div>
        <p className="text-[13px] text-muted-foreground" data-testid="place-add-point">{point ? `Point: ${point.lat}, ${point.lng}. Kept when you import a new list.` : "No point yet. Tap the map to drop the pin."}</p>
        <Button className="min-h-[52px] w-full" onClick={save} disabled={busy || !point || !name.trim()} data-testid="place-add-save"><Check className="h-5 w-5" aria-hidden="true" />{busy ? "Saving…" : "Save place"}</Button>
        <Button variant="outline" className="min-h-[52px] w-full" onClick={onClose} disabled={busy}><X className="h-5 w-5" aria-hidden="true" />Cancel</Button>
      </div>
    </BottomSheet>
  );
}
