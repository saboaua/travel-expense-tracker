"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tag, Plus, Trash2 } from "lucide-react";

type CategoryRow = {
  id: string;
  name: string;
  enabled: boolean;
  sort_order: number;
};

export default function AdminCategoriesPage() {
  const supabase = createClient();
  const [rows, setRows] = useState<CategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");

  const load = async () => {
    const { data, error } = await supabase
      .from("categories")
      .select("id, name, enabled, sort_order")
      .order("sort_order");
    if (error) setError(error.message);
    else setRows(data || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const saveRow = async (row: CategoryRow) => {
    setError(null);
    const { error } = await supabase.from("categories").update({
      name: row.name.trim(),
      enabled: row.enabled,
      sort_order: row.sort_order,
    }).eq("id", row.id);
    if (error) setError(error.message);
    else await load();
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    const { error } = await supabase.from("categories").insert({
      name: name.trim(),
      enabled: true,
      sort_order: (rows.at(-1)?.sort_order || 0) + 1,
    });
    if (error) {
      setError(error.message);
      return;
    }
    setName("");
    await load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this category? Existing expenses will keep the old name.")) return;
    setError(null);
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) setError(error.message);
    else await load();
  };

  return (
    <div className="p-4 md:p-8 pb-24 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
          <Tag className="h-7 w-7" />
          Categories
        </h1>
        <p className="text-muted-foreground mt-1">Manage expense categories. Disabled ones are hidden from new expenses.</p>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-md">{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle>Add category</CardTitle>
          <CardDescription>New categories appear immediately in expense forms.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={add} className="flex gap-2">
            <Input
              placeholder="Category name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex-1"
            />
            <Button type="submit" className="gap-2">
              <Plus className="h-4 w-4" /> Add
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Existing categories</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No categories yet.</p>
          ) : (
            rows.map((row) => (
              <div key={row.id} className="flex flex-col sm:flex-row gap-2 items-start sm:items-center border rounded-md p-3">
                <Input
                  value={row.name}
                  onChange={(e) => setRows(rows.map(r => r.id === row.id ? { ...r, name: e.target.value } : r))}
                  className="flex-1"
                />
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 text-sm">
                    <input
                      type="checkbox"
                      checked={row.enabled}
                      onChange={(e) => setRows(rows.map(r => r.id === row.id ? { ...r, enabled: e.target.checked } : r))}
                    />
                    Enabled
                  </label>
                  <Input
                    type="number"
                    value={row.sort_order}
                    onChange={(e) => setRows(rows.map(r => r.id === row.id ? { ...r, sort_order: Number(e.target.value) } : r))}
                    className="w-20"
                  />
                  <Button size="sm" variant="outline" onClick={() => saveRow(row)}>Save</Button>
                  <Button size="sm" variant="ghost" className="text-red-600" onClick={() => remove(row.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
