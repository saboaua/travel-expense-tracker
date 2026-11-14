"use client";

import { useEffect, useState } from "react";
import { Home, Loader2, MapPin } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { isMissingColumn } from "@/lib/columns";
import { currentPlace } from "@/lib/scan-place";
import { countryName } from "@/lib/scan-destination";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AccordionSection } from "@/components/ui/accordion";

/** Where the person lives. Scan and Upload use it to tell a receipt from home apart from one from a trip. */
export function HomePlaceCard() {
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [available, setAvailable] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gpsOk, setGpsOk] = useState(true);
  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [gpsNote, setGpsNote] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error: err } = await supabase.from("profiles").select("home_country, home_city").eq("id", user.id).single();
      if (isMissingColumn(err)) return setAvailable(false); // migration_home_place.sql has not been run yet
      setCountry(data?.home_country || "");
      setCity(data?.home_city || "");
      // the GPS point has its own migration; without it the rest of the card still works
      const g = await supabase.from("profiles").select("home_lat, home_lng").eq("id", user.id).single();
      if (g.error) return setGpsOk(false);
      if (g.data?.home_lat != null && g.data?.home_lng != null) setPoint({ lat: Number(g.data.home_lat), lng: Number(g.data.home_lng) });
    })();
  }, []);

  const useHere = async () => {
    setLocating(true);
    setError(null);
    const p = await currentPlace(6000);
    setLocating(false);
    if (!p) return setError("Could not find your location. Allow location access, or type it in.");
    setCity(p.city || "");
    setCountry(countryName(p.countryCode) || "");
    setSaved(false);
  };

  /** Rounded to about 100 m before it is saved, so it never shows the exact door. */
  const saveGps = () => {
    setGpsBusy(true); setGpsNote(null);
    if (!navigator.geolocation) { setGpsBusy(false); return setGpsNote("This device cannot share its location."); }
    navigator.geolocation.getCurrentPosition(
      async (p) => {
        const at = { lat: Math.round(p.coords.latitude * 1000) / 1000, lng: Math.round(p.coords.longitude * 1000) / 1000 };
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        const { error: err } = await supabase.from("profiles").update({ home_lat: at.lat, home_lng: at.lng }).eq("id", user?.id ?? "");
        setGpsBusy(false);
        if (err) return setGpsNote("Could not save. Please try again.");
        setPoint(at); setGpsNote("Saved");
      },
      () => { setGpsBusy(false); setGpsNote("Could not find your location. Allow location access and try again."); },
      { timeout: 10000, maximumAge: 60_000, enableHighAccuracy: true }
    );
  };
  const removeGps = async () => {
    setGpsBusy(true); setGpsNote(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { error: err } = await supabase.from("profiles").update({ home_lat: null, home_lng: null }).eq("id", user?.id ?? "");
    setGpsBusy(false);
    if (err) return setGpsNote("Could not remove it. Please try again.");
    setPoint(null); setGpsNote("Removed");
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { error: err } = await supabase.from("profiles").update({ home_country: country.trim() || null, home_city: city.trim() || null }).eq("id", user?.id ?? "");
    setSaving(false);
    if (err) return setError("Could not save. Please try again.");
    setSaved(true);
  };

  if (!available) return null;
  return (
    <AccordionSection
      id="home-place"
      title="Home place"
      icon={<Home />}
      summary={[city.trim(), country.trim()].filter(Boolean).join(", ") || "Not set"}
      description="Where you live. When you scan a receipt here, it is suggested as personal (like groceries) instead of a business trip."
    >
        <form onSubmit={save} className="space-y-4">
          {error && <Alert>{error}</Alert>}
          {saved && <Alert variant="success">Saved</Alert>}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="home-country" className="text-sm font-medium">Country</label>
              <Input id="home-country" value={country} onChange={(e) => { setCountry(e.target.value); setSaved(false); }} placeholder="Aruba" maxLength={80} autoComplete="country-name" />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="home-city" className="text-sm font-medium">City (optional)</label>
              <Input id="home-city" value={city} onChange={(e) => { setCity(e.target.value); setSaved(false); }} placeholder="Oranjestad" maxLength={80} autoComplete="address-level2" />
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={saving} className="min-h-11">{saving ? "Saving..." : "Save"}</Button>
            <Button type="button" variant="outline" onClick={useHere} disabled={locating} className="min-h-11 gap-2">
              {locating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <MapPin className="h-4 w-4" aria-hidden="true" />}
              Use where I am now
            </Button>
          </div>
        </form>

        {gpsOk && (
          <div className={`mt-4 rounded-xl border p-3 ${point ? "border-emerald-300 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-500/10" : "border-dashed bg-muted/40"}`} data-testid="home-gps">
            <div className="flex items-center gap-2"><b className="text-sm">Home GPS point</b><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${point ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200" : "bg-muted text-muted-foreground"}`}>{point ? "Saved" : "Not saved"}</span></div>
            {point && <p className="mt-1 text-sm text-emerald-900 dark:text-emerald-200">{point.lat}, {point.lng} · accurate to about 100 m</p>}
            <p className="mt-1 text-xs text-muted-foreground">{point ? "Rounded so it does not show your exact door. Only you can see it. Used on Best store as your starting point." : "Lets Best store find the supermarkets next to your home, even when location is off. Stand at home and tap Save."}</p>
            {gpsNote && <p className="mt-1 text-xs font-medium" role="status">{gpsNote}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" variant={point ? "outline" : "default"} onClick={saveGps} disabled={gpsBusy} className="min-h-11 gap-2" data-testid="home-gps-save">{gpsBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <MapPin className="h-4 w-4" aria-hidden="true" />}{point ? "Update to here" : "Save my home location"}</Button>
              {point && <Button type="button" variant="outline" onClick={removeGps} disabled={gpsBusy} className="min-h-11" data-testid="home-gps-remove">Remove</Button>}
            </div>
          </div>
        )}
    </AccordionSection>
  );
}
