"use client";

import { Select } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { KIND_META, type PersonalKind } from "@/lib/personal/constants";
import { useCurrencies } from "@/lib/use-currencies";
import { fetchProjectBundle, projectKey, type ProjectBundle } from "@/lib/offline-personal";
import { browserKv, loadWithCache } from "@/lib/offline-store";
import { browserOutbox } from "@/lib/outbox";
import { isRowSave, makeRowApi, saveRow } from "@/lib/row-outbox";
import { OfflineNotice } from "@/components/OfflineNotice";


export function ProjectForm({ kind, projectId }: { kind: PersonalKind; projectId?: string }) {
  const meta = KIND_META[kind];
  const router = useRouter();
  const currencies = useCurrencies();
  const [name, setName] = useState("");
  const [destination, setDestination] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [budget, setBudget] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [status, setStatus] = useState<"active" | "completed">("active");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (!projectId) return;
    (async () => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession(); // read from the phone, so it works offline
      const uid = session?.user.id;
      if (!uid) return setError("Sign in again to open this.");
      const res = await loadWithCache<ProjectBundle>(browserKv, projectKey(uid, projectId), () => fetchProjectBundle(supabase, projectId));
      const waiting = (await browserOutbox.list().catch(() => [])).find((i) => i.id === projectId && i.userId === uid);
      const waitingRow = waiting && isRowSave(waiting) && waiting.table === "personal_projects" ? waiting.row : null;
      if (!res.ok && !waitingRow) return setError("Could not open this. Open it once while online.");
      setSavedAt(res.ok && res.fromCache ? res.savedAt : null);
      const data = { ...(res.ok ? res.data.project : {}), ...(waitingRow ?? {}) } as Partial<ProjectBundle["project"]>;
      setName(data.name ?? "");
      setDestination(data.destination || "");
      setDescription(data.description || "");
      setStartDate(data.start_date || "");
      setEndDate(data.end_date || "");
      setBudget(data.budget != null ? String(data.budget) : "");
      setCurrency(data.currency ?? "USD");
      setStatus(data.status ?? "active");
    })();
  }, [projectId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (endDate && startDate && endDate < startDate) return setError("End date must be after the start date.");
    setSaving(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user.id;
      if (!uid) throw new Error("Sign in again to save.");

      const row = {
        name: name.trim(),
        destination: kind === "personal_trip" ? destination.trim() || null : null,
        description: description.trim() || null,
        start_date: startDate || null,
        end_date: endDate || null,
        budget: budget ? Number(budget) : null,
        currency,
        status,
      };
      const api = makeRowApi(supabase);

      if (projectId) {
        await saveRow({ api, store: browserOutbox, userId: uid, table: "personal_projects", id: projectId, row, waiting: (await browserOutbox.list().catch(() => [])).find((i) => i.id === projectId) ?? null, label: row.name, summary: `${meta.label} · changed` });
        router.push(`${meta.path}/${projectId}`);
      } else {
        const saved = await saveRow({ api, store: browserOutbox, userId: uid, table: "personal_projects", row: { ...row, kind }, label: row.name, summary: `${meta.label} · new` });
        // A project that is still waiting has no page of its own yet, so go to the list, where it shows as waiting
        router.push(saved.queued ? meta.path : `${meta.path}/${saved.id}`);
      }
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not save.");
      setSaving(false);
    }
  };

  return (
    <div className="p-4 md:p-8 pb-28 max-w-lg mx-auto">
      <Link href={projectId ? `${meta.path}/${projectId}` : meta.path} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>{projectId ? `Edit ${meta.noun}` : `New ${meta.noun}`}</CardTitle>
        </CardHeader>
        <CardContent>
          <OfflineNotice savedAt={savedAt} writable />
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} placeholder={kind === "home_project" ? "Kitchen renovation" : "Family trip to Curaçao"} />
            </div>
            {kind === "personal_trip" && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Destination</label>
                <Input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="City, Country" />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">Start date</label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">End date</label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">Budget <span className="font-normal text-muted-foreground">(optional)</span></label>
                <Input type="number" step="0.01" min="0" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="0.00" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Budget currency</label>
                <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  {currencies.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Notes <span className="font-normal text-muted-foreground">(optional)</span></label>
              <textarea className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            {projectId && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={status === "completed"} onChange={(e) => setStatus(e.target.checked ? "completed" : "active")} />
                Mark as completed
              </label>
            )}
            {error && <Alert>{error}</Alert>}
            <Button type="submit" disabled={saving} className="w-full">{saving ? "Saving..." : projectId ? "Save changes" : `Create ${meta.noun}`}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
