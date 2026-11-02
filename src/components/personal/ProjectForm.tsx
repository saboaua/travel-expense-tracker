"use client";

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

const selectClass = "flex h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm";

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

  useEffect(() => {
    if (!projectId) return;
    createClient()
      .from("personal_projects")
      .select("*")
      .eq("id", projectId)
      .single()
      .then(({ data }) => {
        if (!data) return;
        setName(data.name);
        setDestination(data.destination || "");
        setDescription(data.description || "");
        setStartDate(data.start_date || "");
        setEndDate(data.end_date || "");
        setBudget(data.budget != null ? String(data.budget) : "");
        setCurrency(data.currency);
        setStatus(data.status);
      });
  }, [projectId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (endDate && startDate && endDate < startDate) return setError("End date must be after the start date.");
    setSaving(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

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

      if (projectId) {
        const { error } = await supabase.from("personal_projects").update(row).eq("id", projectId);
        if (error) throw error;
        router.push(`${meta.path}/${projectId}`);
      } else {
        const { data, error } = await supabase
          .from("personal_projects")
          .insert({ ...row, user_id: user.id, kind })
          .select("id")
          .single();
        if (error) throw error;
        router.push(`${meta.path}/${data.id}`);
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
                <select className={selectClass} value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  {currencies.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Notes <span className="font-normal text-muted-foreground">(optional)</span></label>
              <textarea className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            {projectId && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={status === "completed"} onChange={(e) => setStatus(e.target.checked ? "completed" : "active")} />
                Mark as completed
              </label>
            )}
            {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-600">{error}</p>}
            <Button type="submit" disabled={saving} className="w-full">{saving ? "Saving..." : projectId ? "Save changes" : `Create ${meta.noun}`}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
