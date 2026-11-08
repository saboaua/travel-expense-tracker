"use client";

import { PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AccordionGroup, AccordionSection } from "@/components/ui/accordion";
import { Coins, Plus } from "lucide-react";

type CurrencyRow = {
  code: string;
  name: string;
  enabled: boolean;
  usd_rate: number | null;
  sort_order: number;
};

export default function AdminCurrenciesPage() {
  const supabase = createClient();
  const [rows, setRows] = useState<CurrencyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [rate, setRate] = useState("");

  const load = async () => {
    const { data, error } = await supabase
      .from("currencies")
      .select("code, name, enabled, usd_rate, sort_order")
      .order("sort_order");
    if (error) setError(error.message);
    else setRows(data || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loads once on mount
  }, []);

  const saveRow = async (row: CurrencyRow) => {
    setError(null);
    const { error } = await supabase.from("currencies").upsert({
      code: row.code,
      name: row.name,
      enabled: row.enabled,
      usd_rate: row.usd_rate,
      sort_order: row.sort_order,
    });
    if (error) setError(error.message);
    else await load();
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const { error } = await supabase.from("currencies").insert({
      code: code.toUpperCase().trim(),
      name: name.trim(),
      enabled: true,
      usd_rate: rate ? Number(rate) : null,
      sort_order: (rows.at(-1)?.sort_order || 0) + 1,
    });
    if (error) {
      setError(error.message);
      return;
    }
    setCode("");
    setName("");
    setRate("");
    await load();
  };

  return (
    <div className="p-4 md:p-8 pb-24 max-w-3xl mx-auto space-y-6">
      <PageHeader title="Currencies" description={<>Turn currencies on or off. Only enabled ones appear when adding a trip or expense.</>} />

      {error && <Alert>{error}</Alert>}

      <AccordionGroup>
      <AccordionSection id="available" title="Available currencies" icon={<Coins />} summary={loading ? "Loading…" : `${rows.filter((r) => r.enabled).length} of ${rows.length} turned on`} description="Rate is USD per 1 unit. Leave it empty to use the live market rate.">
        <div className="space-y-3">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            rows.map((row) => (
              <div key={row.code} className="grid grid-cols-[auto_1fr] sm:grid-cols-[auto_72px_1fr_120px] gap-3 items-center border rounded-xl p-3">
                <input
                  type="checkbox"
                  checked={row.enabled}
                  onChange={(e) => saveRow({ ...row, enabled: e.target.checked })}
                  className="h-4 w-4"
                />
                <p className="font-medium">{row.code}</p>
                <Input
                  value={row.name}
                  onChange={(e) => setRows(rows.map((r) => r.code === row.code ? { ...r, name: e.target.value } : r))}
                  onBlur={() => saveRow(row)}
                />
                <Input
                  type="number"
                  step="0.000001"
                  placeholder="live rate"
                  value={row.usd_rate ?? ""}
                  onChange={(e) =>
                    setRows(
                      rows.map((r) =>
                        r.code === row.code
                          ? { ...r, usd_rate: e.target.value ? Number(e.target.value) : null }
                          : r
                      )
                    )
                  }
                  onBlur={() => saveRow(rows.find((r) => r.code === row.code) || row)}
                />
              </div>
            ))
          )}
        </div>
      </AccordionSection>

      <AccordionSection id="add" title="Add a currency" icon={<Plus />} summary="Code, name and rate">
          <form onSubmit={add} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <Input placeholder="Code" value={code} onChange={(e) => setCode(e.target.value)} required maxLength={3} />
            <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required className="sm:col-span-2" />
            <Input placeholder="USD rate" type="number" step="0.000001" value={rate} onChange={(e) => setRate(e.target.value)} />
            <Button type="submit" className="sm:col-span-4">Add</Button>
          </form>
        </AccordionSection>
      </AccordionGroup>
    </div>
  );
}
