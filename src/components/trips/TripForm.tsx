"use client";

import { BackLink } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { useConfirm } from "@/components/ui/confirm";
import { Alert } from "@/components/ui/alert";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CategoryButtons } from "@/components/ui/category-buttons";
import { BedDouble, FileText, Trash2, X } from "lucide-react";
import { DOC_KINDS, type DocKind } from "@/lib/documents";
import { DOC_ACCEPT, DOC_BUCKET } from "@/lib/document-upload";
import { makeDocumentApi, saveDocument } from "@/lib/document-outbox";
import { deleteRow, isRowSave, makeRowApi, saveRow } from "@/lib/row-outbox";
import { browserBlobs, browserKv, loadWithCache } from "@/lib/offline-store";
import { browserOutbox } from "@/lib/outbox";
import { tripKey } from "@/lib/offline-data";
import { OfflineNotice } from "@/components/OfflineNotice";
import { useTravelCategories } from "@/lib/use-categories";
import { useCurrencies } from "@/lib/use-currencies";
import { TRIP_COLS, TRIP_COLS_BASE, withColumnFallback } from "@/lib/columns";


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
  const [hotelName, setHotelName] = useState("");
  const [hotelAddress, setHotelAddress] = useState("");
  const [showHotel, setShowHotel] = useState(false);
  const [hadHotel, setHadHotel] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Documents picked while creating a trip are uploaded right after the trip is saved
  const [pendingDocs, setPendingDocs] = useState<{ id: string; kind: DocKind; file: File }[]>([]);
  const [docKind, setDocKind] = useState<DocKind>("ticket");
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (!tripId) return;
    (async () => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession(); // read from the phone, so it works offline
      const uid = session?.user.id;
      if (!uid) { setError("Sign in again to open this trip."); setLoaded(true); return; }
      type Row = { name: string; destination: string | null; category: string | null; start_date: string; end_date: string | null; currency: string | null; status: string; notes: string | null; hotel_name?: string | null; hotel_address?: string | null };
      const res = await loadWithCache<Row>(browserKv, tripKey(uid, tripId), () => withColumnFallback((cols) => supabase.from("trips").select(cols).eq("id", tripId).single(), TRIP_COLS, TRIP_COLS_BASE) as unknown as PromiseLike<{ data: Row | null; error: unknown }>);
      // A trip created or changed offline shows as it will be saved
      const waiting = (await browserOutbox.list().catch(() => [])).find((i) => i.id === tripId && i.userId === uid);
      const waitingRow = waiting && isRowSave(waiting) && waiting.table === "trips" ? waiting.row : null;
      if (!res.ok && !waitingRow) {
        setError((res.error as { message?: string } | null)?.message || "Trip not found");
        setLoaded(true);
        return;
      }
      setSavedAt(res.ok && res.fromCache ? res.savedAt : null);
      const data = { ...(res.ok ? res.data : {}), ...(waitingRow ?? {}) } as Partial<Row>;
      setName(data.name || "");
      setDestination(data.destination || "");
      setCategory(data.category || "");
      setStartDate(data.start_date || "");
      setEndDate(data.end_date || "");
      setCurrency(data.currency || "USD");
      setStatus(data.status === "completed" ? "completed" : "active");
      setNotes(data.notes || "");
      setHotelName(data.hotel_name || "");
      setHotelAddress(data.hotel_address || "");
      const has = !!(data.hotel_name || data.hotel_address);
      setHadHotel(has);
      setShowHotel(has || (typeof window !== "undefined" && window.location.hash === "#hotel"));
      setLoaded(true);
    })();
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
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user.id;
      if (!uid) throw new Error("Sign in again to save the trip.");
      const row = {
        name: name.trim(),
        destination: destination.trim() || null,
        category: category || null,
        start_date: startDate,
        end_date: endDate || null,
        currency,
        notes: notes.trim() || null,
        // Only sent when there is something to save (or clear), so a database without the hotel columns keeps working
        ...(hotelName.trim() || hotelAddress.trim() || hadHotel ? { hotel_name: hotelName.trim() || null, hotel_address: hotelAddress.trim() || null } : {}),
      };
      const api = makeRowApi(supabase);
      const waiting = tripId ? (await browserOutbox.list().catch(() => [])).find((i) => i.id === tripId) ?? null : null;

      if (tripId) {
        await saveRow({ api, store: browserOutbox, userId: uid, table: "trips", id: tripId, row: { ...row, status, updated_at: new Date().toISOString() }, waiting, label: row.name, summary: "Trip · changed" });
        router.push(`/trips/${tripId}`);
      } else {
        const saved = await saveRow({ api, store: browserOutbox, userId: uid, table: "trips", row: { ...row, status: "active" }, label: row.name, summary: "Trip · new" });
        let failed = 0;
        for (const d of pendingDocs) {
          try {
            await saveDocument({
              api: makeDocumentApi(supabase), store: browserOutbox, userId: uid, doc: null, tripId: saved.id,
              fields: { kind: d.kind, title: d.file.name.replace(/\.[^.]+$/, "") }, file: d.file,
              dependsOn: saved.queued ? [saved.id] : [],
              keep: (path, blob) => browserBlobs.put(`${DOC_BUCKET}/${path}`, blob),
            });
          } catch {
            failed++;
          }
        }
        // A trip that is still waiting has no page of its own yet, so go to the list, where it shows as waiting
        router.push(saved.queued ? "/trips" : `/trips/${saved.id}${failed ? `?docs_failed=${failed}` : ""}`);
      }
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not save the trip.");
      setSaving(false);
    }
  };

  const confirm = useConfirm();
  const remove = async () => {
    if (!tripId) return;
    if (!(await confirm({ title: "Delete trip?", message: "Delete this trip and all of its expenses, receipt photos and documents? This cannot be undone.", confirmLabel: "Delete trip", destructive: true }))) return;
    setSaving(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sign in again to delete the trip.");
      // The receipt photos and documents that go with the trip are looked up and removed when the delete is sent
      await deleteRow({
        api: makeRowApi(supabase), store: browserOutbox, userId: session.user.id, table: "trips", id: tripId, label: name || "Trip", summary: "Trip · delete",
        sweep: [
          { table: "expenses", fk: "trip_id", column: "receipt_path", bucket: "receipts" },
          { table: "travel_documents", fk: "trip_id", column: "file_path", bucket: DOC_BUCKET },
        ],
        waiting: (await browserOutbox.list().catch(() => [])).find((i) => i.id === tripId) ?? null,
      });
      router.push("/trips");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not delete the trip.");
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl p-4 pb-28 md:p-8">
      <BackLink href={tripId ? `/trips/${tripId}` : "/trips"} className="mb-6">{tripId ? "Trip" : "Trips"}</BackLink>

      <Card className="rounded-xl">
        <CardHeader>
          <CardTitle>{editing ? "Edit trip" : "New trip"}</CardTitle>
          <CardDescription>{editing ? "Change the name, destination, dates, currency or status" : "Create a business trip to track its expenses"}</CardDescription>
        </CardHeader>
        <CardContent>
          <OfflineNotice savedAt={savedAt} writable />
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
                <Select id="currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  {currencies.map((c) => (
                    <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                  ))}
                </Select>
                <p className="text-xs text-muted-foreground">Each expense can still use a different currency. Totals are also shown in USD.</p>
              </div>

              {editing && (
                <div className="space-y-2">
                  <label htmlFor="status" className="text-sm font-medium">Status</label>
                  <Select id="status" value={status} onChange={(e) => setStatus(e.target.value === "completed" ? "completed" : "active")}>
                    <option value="active">Active: receipts can still be added</option>
                    <option value="completed">Completed: every invoice is in</option>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <label htmlFor="notes" className="text-sm font-medium">Notes</label>
                <textarea id="notes" placeholder="Optional notes about this trip..." value={notes} onChange={(e) => setNotes(e.target.value)} className="flex min-h-[80px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
              </div>

              <div id="hotel" className="scroll-mt-4 space-y-2">
                {showHotel ? (
                  <>
                    <label htmlFor="hotelName" className="text-sm font-medium">Hotel <span className="font-normal text-muted-foreground">(optional)</span></label>
                    <Input id="hotelName" placeholder="e.g. Courtyard Marriott" value={hotelName} onChange={(e) => setHotelName(e.target.value)} maxLength={120} autoComplete="off" />
                    <label htmlFor="hotelAddress" className="sr-only">Hotel address</label>
                    <Input id="hotelAddress" placeholder="Address, e.g. Multiplaza Mall, Ave. Israel, Panama" value={hotelAddress} onChange={(e) => setHotelAddress(e.target.value)} maxLength={240} autoComplete="off" />
                    <p className="text-xs text-muted-foreground">The trip page gets a Directions button that opens your maps app.</p>
                  </>
                ) : (
                  <button type="button" onClick={() => setShowHotel(true)} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed text-sm font-semibold text-primary hover:bg-accent" data-testid="hotel-open">
                    <BedDouble className="h-4 w-4" aria-hidden="true" /> Add hotel
                  </button>
                )}
              </div>

              {!editing && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Documents <span className="font-normal text-muted-foreground">(optional)</span></label>
                  <p className="text-xs text-muted-foreground">Ticket, booking, visa or insurance. They are saved with the trip so you have them close by.</p>
                  <div className="flex gap-2">
                    <Select value={docKind} onChange={(e) => setDocKind(e.target.value as DocKind)} className="w-auto min-w-fit px-2" aria-label="Document type">
                      {DOC_KINDS.filter((k) => k.value !== "passport").map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                    </Select>
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
                        <li key={d.id} className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm">
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

              {error && <Alert>{error}</Alert>}

              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? "Saving…" : editing ? "Save changes" : "Create trip"}
              </Button>

              {editing && (
                <div className="mt-2 rounded-xl border border-red-200 bg-red-50/40 p-4 dark:border-red-900/60 dark:bg-red-950/50">
                  <p className="text-sm font-medium text-red-700 dark:text-red-300">Danger zone</p>
                  <p className="mb-3 mt-1 text-xs text-muted-foreground">Deleting removes the trip, all of its expenses, receipt photos and documents.</p>
                  <Button type="button" variant="outline" className="gap-2 border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/60" disabled={saving} onClick={remove}>
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
