"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, type LucideIcon } from "lucide-react";
import { ICON_KEYS, iconFor } from "@/lib/category-icons";

type Row = { id: string; name: string; icon: string | null; enabled: boolean; sort_order: number };

export function CategoryManager({
  table,
  title,
  subtitle,
  addHint,
  deleteWarning,
  headerIcon: HeaderIcon,
  defaultIcon,
}: {
  table: "categories" | "travel_categories";
  title: string;
  subtitle: string;
  addHint: string;
  deleteWarning: string;
  headerIcon: LucideIcon;
  defaultIcon: string;
}) {
  const supabase = createClient();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState(defaultIcon);

  const load = async () => {
    const { data, error } = await supabase
      .from(table)
      .select("id, name, icon, enabled, sort_order")
      .order("sort_order");
    if (error) setError(error.message);
    else setRows((data as Row[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const patch = (id: string, change: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...change } : r)));

  const saveRow = async (row: Row) => {
    setError(null);
    const { error } = await supabase
      .from(table)
      .update({
        name: row.name.trim(),
        icon: row.icon || defaultIcon,
        enabled: row.enabled,
        sort_order: row.sort_order,
      })
      .eq("id", row.id);
    if (error) setError(error.message);
    else await load();
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    const { error } = await supabase.from(table).insert({
      name: name.trim(),
      icon,
      enabled: true,
      sort_order: (rows.length ? Math.max(...rows.map((r) => r.sort_order)) : 0) + 1,
    });
    if (error) {
      setError(error.message);
      return;
    }
    setName("");
    await load();
  };

  const remove = async (id: string) => {
    if (!confirm(deleteWarning)) return;
    setError(null);
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) setError(error.message);
    else await load();
  };

  const selectClass = "flex h-10 rounded-md border border-input bg-background px-2 py-2 text-sm";

  return (
    <div className="p-4 md:p-8 pb-24 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
          <HeaderIcon className="h-7 w-7" />
          {title}
        </h1>
        <p className="text-muted-foreground mt-1">{subtitle}</p>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-md">{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle>Add</CardTitle>
          <CardDescription>{addHint}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={add} className="flex flex-col sm:flex-row gap-2">
            <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} className="flex-1" />
            <select value={icon} onChange={(e) => setIcon(e.target.value)} className={selectClass} aria-label="Icon">
              {ICON_KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            <Button type="submit" className="gap-2">
              <Plus className="h-4 w-4" /> Add
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Existing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing here yet.</p>
          ) : (
            rows.map((row) => {
              const Icon = iconFor(row.icon);
              return (
                <div key={row.id} className="flex flex-col sm:flex-row gap-2 items-start sm:items-center border rounded-md p-3">
                  <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
                  <Input value={row.name} onChange={(e) => patch(row.id, { name: e.target.value })} className="flex-1" />
                  <div className="flex flex-wrap items-center gap-2">
                    <select value={row.icon || defaultIcon} onChange={(e) => patch(row.id, { icon: e.target.value })} className={selectClass} aria-label="Icon">
                      {ICON_KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
                    </select>
                    <label className="flex items-center gap-1 text-sm">
                      <input type="checkbox" checked={row.enabled} onChange={(e) => patch(row.id, { enabled: e.target.checked })} />
                      Enabled
                    </label>
                    <Input type="number" value={row.sort_order} onChange={(e) => patch(row.id, { sort_order: Number(e.target.value) })} className="w-20" />
                    <Button size="sm" variant="outline" onClick={() => saveRow(row)}>Save</Button>
                    <Button size="sm" variant="ghost" className="text-red-600" onClick={() => remove(row.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
