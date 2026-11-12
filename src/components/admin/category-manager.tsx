"use client";

import { Select } from "@/components/ui/select";
import { useConfirm } from "@/components/ui/confirm";
import { Alert } from "@/components/ui/alert";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { ICON_KEYS, iconFor } from "@/lib/category-icons";

type Row = { id: string; name: string; icon: string | null; enabled: boolean; sort_order: number };

/**
 * One editable list of categories (travel receipts, trip types or grocery items), shown inside a section of Admin > Categories.
 * Changes save by themselves: the name when you leave the field, the icon and Enabled as soon as you change them, and
 * moving a row up or down swaps its place with the neighbour.
 */
export function CategoryManager({
  table,
  subtitle,
  addTitle,
  addPlaceholder,
  deleteWarning,
  defaultIcon,
  noun,
  onCount,
}: {
  table: "categories" | "travel_categories" | "grocery_categories" | "house_areas";
  subtitle: string;
  addTitle: string;
  addPlaceholder: string;
  deleteWarning: string;
  defaultIcon: string;
  /** Singular word used in button labels, for example "category" or "trip type" */
  noun: string;
  /** Told the number of rows after each load, for the section's one-line summary */
  onCount?: (n: number) => void;
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
    else {
      const list = (data as Row[]) || [];
      setRows(list);
      onCount?.(list.length);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loads once on mount
  }, []);

  const patch = (id: string, change: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...change } : r)));

  /** Saves what changed on one row. An empty name is not saved: the list is reloaded so the old name comes back. */
  const save = async (row: Row) => {
    setError(null);
    if (!row.name.trim()) { await load(); return; }
    const { error } = await supabase
      .from(table)
      .update({ name: row.name.trim(), icon: row.icon || defaultIcon, enabled: row.enabled, sort_order: row.sort_order })
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

  /** Swaps the place of a row and its neighbour. Positions are renumbered 1, 2, 3... so equal numbers can never trap a row. */
  const move = async (index: number, by: -1 | 1) => {
    const target = index + by;
    if (target < 0 || target >= rows.length) return;
    setError(null);
    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    setRows(next.map((r, i) => ({ ...r, sort_order: i + 1 })));
    const results = await Promise.all(
      next.map((r, i) => (r.sort_order === i + 1 ? null : supabase.from(table).update({ sort_order: i + 1 }).eq("id", r.id))),
    );
    const failed = results.find((r) => r && r.error);
    if (failed && failed.error) setError(failed.error.message);
    await load();
  };

  const confirm = useConfirm();
  const remove = async (id: string) => {
    if (!(await confirm({ message: deleteWarning, destructive: true }))) return;
    setError(null);
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) setError(error.message);
    else await load();
  };

  const iconBtn = "flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent disabled:opacity-30 disabled:hover:bg-transparent";

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{subtitle}</p>

      {error && <Alert>{error}</Alert>}

      <form onSubmit={add} className="space-y-2.5 rounded-xl border bg-muted/30 p-3.5 md:flex md:items-end md:gap-3 md:space-y-0">
        <p className="text-[15px] font-semibold md:hidden">{addTitle}</p>
        <div className="space-y-1.5 md:flex-1">
          <label className="text-[13px] text-muted-foreground" htmlFor={`${table}-name`}>Name</label>
          <Input id={`${table}-name`} placeholder={addPlaceholder} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5 md:w-44">
          <label className="text-[13px] text-muted-foreground" htmlFor={`${table}-icon`}>Icon</label>
          <Select id={`${table}-icon`} value={icon} onChange={(e) => setIcon(e.target.value)}>
            {ICON_KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
          </Select>
        </div>
        <Button type="submit" className="min-h-11 w-full gap-2 md:w-auto">
          <Plus className="h-4 w-4" aria-hidden="true" /> Add
        </Button>
      </form>

      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Existing{!loading && ` · ${rows.length}`}</p>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing here yet.</p>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((row, i) => {
            const Icon = iconFor(row.icon);
            return (
              <li key={row.id} className="rounded-xl border bg-card p-3 md:flex md:items-center md:gap-3 md:py-2">
                <div className="flex items-center gap-2.5 md:flex-1">
                  <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border bg-muted/40">
                    <Icon className="h-5 w-5 text-foreground/80" aria-hidden="true" />
                    {/* the icon button is the icon list: a select laid over it, so it works with a thumb and with a keyboard */}
                    <select
                      aria-label={`Icon for ${row.name}`}
                      value={row.icon || defaultIcon}
                      onChange={(e) => { const next = { ...row, icon: e.target.value }; patch(row.id, { icon: e.target.value }); void save(next); }}
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    >
                      {ICON_KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
                    </select>
                  </span>
                  <Input
                    value={row.name}
                    aria-label={`Name of ${noun}`}
                    onChange={(e) => patch(row.id, { name: e.target.value })}
                    onBlur={() => void save(row)}
                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                    className="min-w-0 flex-1"
                  />
                </div>
                <div className="mt-1 flex items-center gap-1 md:mt-0">
                  <label className="flex min-h-11 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={row.enabled}
                      onChange={(e) => { const next = { ...row, enabled: e.target.checked }; patch(row.id, { enabled: e.target.checked }); void save(next); }}
                      className="h-5 w-5 accent-[hsl(var(--primary))]"
                    />
                    Enabled
                  </label>
                  <span className="flex-1 md:w-4 md:flex-none" />
                  <button type="button" className={iconBtn} disabled={i === 0} onClick={() => void move(i, -1)} aria-label={`Move ${row.name} up`}>
                    <ArrowUp className="h-[18px] w-[18px]" aria-hidden="true" />
                  </button>
                  <button type="button" className={iconBtn} disabled={i === rows.length - 1} onClick={() => void move(i, 1)} aria-label={`Move ${row.name} down`}>
                    <ArrowDown className="h-[18px] w-[18px]" aria-hidden="true" />
                  </button>
                  <button type="button" className={`${iconBtn} text-red-600 hover:text-red-700`} onClick={() => void remove(row.id)} aria-label={`Delete ${row.name}`}>
                    <Trash2 className="h-[18px] w-[18px]" aria-hidden="true" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
