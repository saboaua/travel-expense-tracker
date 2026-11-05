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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Where the person lives. Scan and Upload use it to tell a receipt from home apart from one from a trip. */
export function HomePlaceCard() {
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [available, setAvailable] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error: err } = await supabase.from("profiles").select("home_country, home_city").eq("id", user.id).single();
      if (isMissingColumn(err)) return setAvailable(false); // migration_home_place.sql has not been run yet
      setCountry(data?.home_country || "");
      setCity(data?.home_city || "");
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Home className="h-5 w-5" aria-hidden="true" /> Home place</CardTitle>
        <CardDescription>Where you live. When you scan a receipt here, it is suggested as personal (like groceries) instead of a business trip.</CardDescription>
      </CardHeader>
      <CardContent>
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
      </CardContent>
    </Card>
  );
}
