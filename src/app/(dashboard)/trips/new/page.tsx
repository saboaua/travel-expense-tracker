"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Users, Building2, MapPin, FileText } from "lucide-react";
import Link from "next/link";
import { useCurrencies } from "@/lib/use-currencies";

const TRAVEL_CATEGORIES = [
  { value: "Client Meeting", icon: Users },
  { value: "Conference", icon: Building2 },
  { value: "Strategy Session", icon: MapPin },
  { value: "Internal Review", icon: FileText },
] as const;

export default function NewTripPage() {
  const currencies = useCurrencies();
  const [name, setName] = useState("");
  const [destination, setDestination] = useState("");
  const [category, setCategory] = useState<string>("Client Meeting");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("Not authenticated");
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("trips")
      .insert({
        user_id: user.id,
        name,
        destination: destination || null,
        category: category || null,
        start_date: startDate,
        end_date: endDate || null,
        currency,
        notes: notes || null,
        status: "active",
      })
      .select()
      .single();

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push(`/trips/${data.id}`);
    router.refresh();
  };

  return (
    <div className="p-4 md:p-8 pb-28 max-w-lg mx-auto">
      <Link href="/trips" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="h-4 w-4" />
        Back to trips
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>New Trip</CardTitle>
          <CardDescription>Create a new business travel to track expenses</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium">Trip Name *</label>
              <Input id="name" placeholder="e.g. Winlott Meeting 2026" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>

            <div className="space-y-2">
              <label htmlFor="destination" className="text-sm font-medium">Destination</label>
              <Input id="destination" placeholder="e.g. Panama City, Panama" value={destination} onChange={(e) => setDestination(e.target.value)} />
              <p className="text-xs text-muted-foreground">Shown on the dashboard (e.g. Panama City from Nov 17 \u2013 Nov 20).</p>
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
                {currencies.map((c) => (
                  <option key={c.code} value={c.code}>{c.code} \u2014 {c.name}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">Each expense can still use a different currency. Totals are also shown in USD.</p>
            </div>

            <div className="space-y-2">
              <label htmlFor="notes" className="text-sm font-medium">Notes</label>
              <textarea id="notes" placeholder="Optional notes about this trip..." value={notes} onChange={(e) => setNotes(e.target.value)} className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </div>

            {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-md">{error}</p>}

            <Button type="submit" className="w-full" disabled={loading}>{loading ? "Creating..." : "Create Trip"}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
