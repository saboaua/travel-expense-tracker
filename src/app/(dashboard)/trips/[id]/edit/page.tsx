"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Trash2, Users, Building2, MapPin, FileText } from "lucide-react";
import { useCurrencies } from "@/lib/use-currencies";

const TRAVEL_CATEGORIES = [
  { value: "Client Meeting", icon: Users },
  { value: "Conference", icon: Building2 },
  { value: "Strategy Session", icon: MapPin },
  { value: "Internal Review", icon: FileText },
] as const;

export default function EditTripPage() {
  const currencies = useCurrencies();
  const params = useParams();
  const tripId = params.id as string;
  const router = useRouter();
  const supabase = createClient();

  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState("");
  const [destination, setDestination] = useState("");
  const [category, setCategory] = useState("Client Meeting");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [status, setStatus] = useState("active");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("trips").select("*").eq("id", tripId).single().then(({ data, error }) => {
      if (error || !data) {
        setError(error?.message || "Trip not found");
        setLoaded(true);
        return;
      }
      setName(data.name || "");
      setDestination(data.destination || "");
      setCategory(data.category || "Client Meeting");
      setStartDate(data.start_date || "");
      setEndDate(data.end_date || "");
      setCurrency(data.currency || "USD");
      setStatus(data.status || "active");
      setNotes(data.notes || "");
      setLoaded(true);
    });
  }, [supabase, tripId]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const { error } = await supabase.from("trips").update({
      name,
      destination: destination || null,
      category: category || null,
      start_date: startDate,
      end_date: endDate || null,
      currency,
      status,
      notes: notes || null,
      updated_at: new Date().toISOString(),
    }).eq("id", tripId);

    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }
    router.push(`/trips/${tripId}`);
    router.refresh();
  };

  const remove = async () => {
    if (!window.confirm("Delete this trip and all of its expenses? This cannot be undone.")) return;
    setSaving(true);
    const { error } = await supabase.from("trips").delete().eq("id", tripId);
    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }
    router.push("/trips");
    router.refresh();
  };

  return (
    <div className="p-4 md:p-8 pb-28 max-w-lg mx-auto">
      <Link href={`/trips/${tripId}`} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="h-4 w-4" /> Back to trip
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>Edit Trip</CardTitle>
          <CardDescription>Change the name, destination, dates, currency, or status</CardDescription>
        </CardHeader>
        <CardContent>
          {!loaded ? (
            <p className="text-sm text-muted-foreground">Loading\u2026</p>
          ) : (
            <form onSubmit={save} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="name" className="text-sm font-medium">Trip Name *</label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>

              <div className="space-y-2">
                <label htmlFor="destination" className="text-sm font-medium">Destination</label>
                <Input id="destination" placeholder="e.g. Panama City, Panama" value={destination} onChange={(e) => setDestination(e.target.value)} />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Travel Category</label>
                <div className="flex flex-wrap gap-2">
                  {TRAVEL_CATEGORIES.map(({ value, icon: Icon }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setCategory(value)}
                      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                        category === value
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input bg-background hover:bg-accent"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {value}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="startDate" className="text-sm font-medium">Start Date *</label>
                <Input id="startDate" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required className="w-full min-w-0" />
              </div>
              <div className="space-y-2">
                <label htmlFor="endDate" className="text-sm font-medium">End Date</label>
                <Input id="endDate" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full min-w-0" />
              </div>
              <div className="space-y-2">
                <label htmlFor="currency" className="text-sm font-medium">Default currency</label>
                <select id="currency" value={currency} onChange={(e) => setCurrency(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  {currencies.map((c) => <option key={c.code} value={c.code}>{c.code} \u2014 {c.name}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label htmlFor="status" className="text-sm font-medium">Status</label>
                <select id="status" value={status} onChange={(e) => setStatus(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
              <div className="space-y-2">
                <label htmlFor="notes" className="text-sm font-medium">Notes</label>
                <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
              </div>
              {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-md">{error}</p>}
              <Button type="submit" className="w-full" disabled={saving}>{saving ? "Saving\u2026" : "Save changes"}</Button>
              <Button type="button" variant="outline" className="w-full gap-2 text-red-600" disabled={saving} onClick={remove}>
                <Trash2 className="h-4 w-4" /> Delete trip
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
