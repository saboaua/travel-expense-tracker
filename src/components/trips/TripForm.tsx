"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CategoryButtons } from "@/components/ui/category-buttons";
import { ArrowLeft, FileText, Trash2, X } from "lucide-react";
import { DOC_KINDS, type DocKind } from "@/lib/documents";
import { DOC_ACCEPT, DOC_BUCKET, saveTravelDocument } from "@/lib/document-upload";
import { useTravelCategories } from "@/lib/use-categories";
import { useCurrencies } from "@/lib/use-currencies";

const selectClass = "flex h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm";

/** One form for creating and editing a trip, so both screens always look and validate the same. */
export function TripForm({ tripId }: { tripId?: string }) {
  const editing = !!tripId;
  const router = useRouter();
  const currencies = useCurrencies();
  const travelCategories = useTravelCategories();

  const [loaded, setLoaded] = useState(!editing);
  const [name, setName] = useState("");
  const [destination, setDestination] = useState("");
  const [category, setCategory] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [status, setStatus] = useState<"active" | "completed">("active");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Documents picked while creating a trip are uploaded right after the trip is saved
  const [pendingDocs, setPendingDocs] = useState<{ id: string; kind: DocKind; file: File }[]>([]);
  const [docKind, setDocKind] = useState<DocKind>("ticket");

  useEffect(() => {
    if (!tripId) return;
    createClient()
      .from("trips")
      .select("*")
      .eq("id", tripId)
      .single()
      .then(({ data, error }) => {
        if (error || !data) setError(error?.message || "Trip not found");
        else {
          setName(data.name || "");
          setDestination(data.destination || "");
          setCategory(data.category || "");
          setStartDate(data.start_date || "");
          setEndDate(data.end_date || "");
          setCurrency(data.currency || "USD");
          setStatus(data.status === "completed" ? "completed" : "active");
          setNotes(data.notes || "");
        }
        setLoaded(true);
      });
  }, [tripId]);

  // New trips default to the first admin-defined travel category
  useEffect(() => {
    if (editing || category || travelCategories.length === 0) return;
    setCategory(travelCategories[0].name);
  }, [editing, category, travelCategories]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Enter a trip name.");
    if (endDate && startDate && endDate < startDate) return setError("The end date can't be before the start date.");

    setSaving(true);
    try {
      const supabase = createClient();
      const row = {
        name: name.trim(),
        destination: destination.trim() || null,
        category: category || null,
        start_date: startDate,
        end_date: endDate || null,
        currency,
        notes: notes.trim() || null,
      };

      if (tripId) {
        const { error } = await supabase.from("trips").update({ ...row, status, updated_at: new Date().toISOString() }).eq("id", tripId);
        if (error) throw error;
        router.push(`/trips/${tripId}`);
      } else {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");
        const { data, error } = await supabase.from("trips").insert({ ...row, user_id: user.id, status: "active" }).select("id").single();
        if (error) throw error;
        let failed = 0;
        for (const d of pendingDocs) {
          try {
            await saveTravelDocument(supabase, user.id, { tripId: data.id, kind: d.kind, title: d.file.name.replace(/\.[^.]+$/, ""), file: d.file });
          } catch {
            failed++;
          }
        }
        router.push(`/trips/${data.id}${failed ? `?docs_failed=${failed}` : ""}`);
      }
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not save the trip.");
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!tripId) return;
    if (!window.confirm("Delete this trip and all of its expenses, receipt photos and documents? This cannot be undone.")) return;
    setSaving(true);
    try {
      const supabase = createClient();
      // Remove the stored receipt images too, so no orphaned files are left behind
      const { data: rows } = await supabase.from("expenses").select("receipt_path").eq("trip_id", tripId);
      const paths = (rows || []).map((r) => r.receipt_path).filter(Boolean) as string[];
      for (let i = 0; i < paths.length; i += 100) {
        await supabase.storage.from("receipts").remove(paths.slice(i, i + 100)).catch(() => {});
      }
      const { data: docRows } = await supabase.from("travel_documents").select("file_path").eq("trip_id", tripId);
      const docPaths = (docRows || []).map((r) => r.file_path).filter(Boolean) as string[];
      if (docPaths.length) await supabase.storage.from(DOC_BUCKET).remove(docPaths).catch(() => {});
      const { error } = await supabase.from("trips").delete().eq("id", tripId);
      if (error) throw error;
      router.push("/trips");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not delete the trip.");
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl p-4 pb-28 md:p-8">
      <Link href={tripId ? `/trips/${tripId}` : "/trips"} className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        {tripId ? "Back to trip" : "Back to trips"}
      </Link>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>{editing ? "Edit trip" : "New trip"}</CardTitle>
          <CardDescription>{editing ? "Change the name, destination, dates, currency or status" : "Create a business trip to track its expenses"}</CardDescription>
        </CardHeader>
        <CardContent>
          {!loaded ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <form onSubmit={submit} className="space-y-5">
              <div className="space-y-2">
                <label htmlFor="name" className="text-sm font-medium">Trip name <span className="text-red-500">*</span></label>
                <Input id="name" placeholder="e.g. Winlott Meeting 2026" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
              </div>

              <div className="space-y-2">
                <label htmlFor="destination" className="text-sm font-medium">Destination</label>
                <Input id="destination" placeholder="e.g. Panama City, Panama" value={destination} onChange={(e) => setDestination(e.target.value)} />
                <p className="text-xs text-muted-foreground">Used for the photo and description on the dashboard and trip page.</p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="startDate" className="text-sm font-medium">Start date <span className="text-red-500">*</span></label>
                  <Input id="startDate" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required className="w-full min-w-0" />
                </div>
                <div className="space-y-2">
                  <label htmlFor="endDate" className="text-sm font-medium">End date</label>
                  <Input id="endDate" type="date" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} className="w-full min-w-0" />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Travel category</label>
                <CategoryButtons options={travelCategories} value={category} onChange={setCategory} />
              </div>

              <div className="space-y-2">
                <label htmlFor="currency" className="text-sm font-medium">Default currency</label>
                <select id="currency" value={currency} onChange={(e) => setCurrency(e.target.value)} className={selectClass}>
                  {currencies.map((c) => (
                    <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">Each expense can still use a different currency. Totals are also shown in USD.</p>
              </div>

              {editing && (
                <div className="space-y-2">
                  <label htmlFor="status" className="text-sm font-medium">Status</label>
                  <select id="status" value={status} onChange={(e) => setStatus(e.target.value === "completed" ? "completed" : "active")} className={selectClass}>
                    <option value="active">Active: receipts can still be added</option>
                    <option value="completed">Completed: every invoice is in</option>
                  </select>
                </div>
              )}

              <div className="space-y-2">
                <label htmlFor="notes" className="text-sm font-medium">Notes</label>
                <textarea id="notes" placeholder="Optional notes about this trip..." value={notes} onChange={(e) => setNotes(e.target.value)} className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
              </div>

              {!editing && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Documents <span className="font-normal text-muted-foreground">(optional)</span></label>
                  <p className="text-xs text-muted-foreground">Ticket, booking, visa or insurance. They are saved with the trip so you have them close by.</p>
                  <div className="flex gap-2">
                    <select value={docKind} onChange={(e) => setDocKind(e.target.value as DocKind)} className="h-10 rounded-md border border-input bg-background px-2 text-sm" aria-label="Document type">
                      {DOC_KINDS.filter((k) => k.value !== "passport").map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                    </select>
                    <Input
                      type="file"
                      accept={DOC_ACCEPT}
                      multiple
                      onChange={(e) => {
                        const picked = Array.from(e.target.files || []).map((file) => ({ id: crypto.randomUUID(), kind: docKind, file }));
                        setPendingDocs((p) => [...p, ...picked]);
                        e.target.value = "";
                      }}
                    />
                  </div>
                  {pendingDocs.length > 0 && (
                    <ul className="space-y-1">
                      {pendingDocs.map((d) => (
                        <li key={d.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1 truncate">{d.file.name}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">{DOC_KINDS.find((k) => k.value === d.kind)?.label}</span>
                          <button type="button" onClick={() => setPendingDocs((p) => p.filter((x) => x.id !== d.id))} aria-label={`Remove ${d.file.name}`}><X className="h-4 w-4" /></button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-600" role="alert">{error}</p>}

              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? "Saving…" : editing ? "Save changes" : "Create trip"}
              </Button>

              {editing && (
                <div className="mt-2 rounded-xl border border-red-200 bg-red-50/40 p-4">
                  <p className="text-sm font-medium text-red-700">Danger zone</p>
                  <p className="mb-3 mt-1 text-xs text-muted-foreground">Deleting removes the trip, all of its expenses, receipt photos and documents.</p>
                  <Button type="button" variant="outline" className="gap-2 border-red-200 text-red-600 hover:bg-red-50" disabled={saving} onClick={remove}>
                    <Trash2 className="h-4 w-4" /> Delete trip
                  </Button>
                </div>
              )}
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
