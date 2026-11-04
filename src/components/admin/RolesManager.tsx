"use client";

import { Select } from "@/components/ui/select";
import { useConfirm } from "@/components/ui/confirm";
import { Alert } from "@/components/ui/alert";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Loader2, Lock, Plus, Shield, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FEATURES, unreviewedFeatures, type FeatureGroup } from "@/lib/access";

export type RoleSummary = {
  key: string;
  label: string;
  description: string | null;
  is_system?: boolean;
  permissions?: string[];
  known_features?: string[];
  effective?: string[];
  users?: number;
};

const GROUPS: FeatureGroup[] = ["App", "Administration"];
const GROUP_HELP: Record<FeatureGroup, string> = {
  App: "Sections people see in their menu.",
  Administration: "Management pages. Give these only to people you trust.",
};

/** Admin screen: create roles and decide which options each role can use. */
export function RolesManager({ onChanged }: { onChanged?: () => void }) {
  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [draft, setDraft] = useState<Record<string, Set<string>>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [setupNeeded, setSetupNeeded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [from, setFrom] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/admin/roles", { cache: "no-store" });
      const data = await res.json();
      if (data.setupNeeded) return setSetupNeeded(data.error);
      if (!res.ok) throw new Error(data.error || "Could not load roles");
      const list = data.roles as RoleSummary[];
      setRoles(list);
      setDraft(Object.fromEntries(list.map((r) => [r.key, new Set(r.effective || [])])));
      setSetupNeeded(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load roles");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const newOptions = useMemo(() => {
    const keys = new Set<string>();
    for (const r of roles) for (const f of unreviewedFeatures({ key: r.key, known_features: r.known_features || [] })) keys.add(f.key);
    return FEATURES.filter((f) => keys.has(f.key));
  }, [roles]);

  const toggle = (role: string, key: string) =>
    setDraft((d) => {
      const next = new Set(d[role]);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return { ...d, [role]: next };
    });

  const setGroup = (role: string, group: FeatureGroup, on: boolean) =>
    setDraft((d) => {
      const next = new Set(d[role]);
      for (const f of FEATURES.filter((x) => x.group === group)) {
        if (on) next.add(f.key);
        else next.delete(f.key);
      }
      return { ...d, [role]: next };
    });

  const dirty = (r: RoleSummary) => {
    const a = [...(draft[r.key] || [])].sort().join(",");
    const b = [...(r.effective || [])].sort().join(",");
    return a !== b;
  };

  const call = async (url: string, init: RequestInit) => {
    const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Something went wrong");
    return data;
  };

  const save = async (r: RoleSummary) => {
    setBusy(r.key);
    setError(null);
    setNotice(null);
    try {
      await call(`/api/admin/roles/${r.key}`, { method: "PATCH", body: JSON.stringify({ permissions: [...(draft[r.key] || [])] }) });
      setNotice(`Saved access for ${r.label}.`);
      await load();
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(null);
    }
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    setNotice(null);
    try {
      const data = await call("/api/admin/roles", { method: "POST", body: JSON.stringify({ label: name, description: desc, copyFrom: from || undefined }) });
      setName("");
      setDesc("");
      setFrom("");
      setNotice(`Role created. Choose what it can use below.`);
      await load();
      setOpen(data.key);
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the role");
    } finally {
      setCreating(false);
    }
  };

  const confirm = useConfirm();
  const remove = async (r: RoleSummary) => {
    const n = r.users || 0;
    if (!(await confirm({ title: "Delete role?", message: n > 0 ? `Delete "${r.label}"? ${n} ${n === 1 ? "person" : "people"} will move to the User role.` : `Delete "${r.label}"?`, confirmLabel: "Delete role", destructive: true }))) return;
    setBusy(r.key);
    setError(null);
    try {
      await call(`/api/admin/roles/${r.key}`, { method: "DELETE" });
      setNotice(`Deleted ${r.label}.`);
      await load();
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete");
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground">Loading roles…</p>;
  if (setupNeeded) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-semibold">One-time setup needed</p>
        <p className="mt-1">{setupNeeded}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error && <Alert>{error}</Alert>}
      {notice && <Alert variant="success">{notice}</Alert>}

      {newOptions.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="text-sm">
            <p className="font-semibold">New options to review</p>
            <p className="mt-0.5 text-muted-foreground">
              {newOptions.map((f) => f.label).join(", ")} {newOptions.length === 1 ? "was" : "were"} added. Open a role below, tick who can use {newOptions.length === 1 ? "it" : "them"} and save.
            </p>
          </div>
        </div>
      )}

      <form onSubmit={create} className="space-y-3 rounded-xl border p-4">
        <p className="font-semibold">Create a role</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs text-muted-foreground">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Accountant" maxLength={40} required />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Start from</label>
            <Select value={from} onChange={(e) => setFrom(e.target.value)}>
              <option value="">Nothing (choose below)</option>
              {roles.filter((r) => r.key !== "admin").map((r) => <option key={r.key} value={r.key}>Same as {r.label}</option>)}
            </Select>
          </div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Description (optional)</label>
          <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Who is this role for?" maxLength={200} />
        </div>
        <Button type="submit" disabled={creating || !name.trim()} className="gap-2">
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create role
        </Button>
      </form>

      <ul className="space-y-3">
        {roles.map((r) => {
          const isAdmin = r.key === "admin";
          const fresh = new Set(unreviewedFeatures({ key: r.key, known_features: r.known_features || [] }).map((f) => f.key));
          const isOpen = open === r.key;
          const count = draft[r.key]?.size ?? 0;
          return (
            <li key={r.key} className="rounded-xl border">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : r.key)}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-3 p-4 text-left"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  {isAdmin ? <Shield className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{r.label}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{r.is_system ? "Built-in" : "Custom"}</span>
                    {fresh.size > 0 && <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">{fresh.size} new</span>}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {isAdmin ? "Full access to everything, always" : `${count} of ${FEATURES.length} options`} · {r.users || 0} {(r.users || 0) === 1 ? "person" : "people"}
                    {r.description ? ` · ${r.description}` : ""}
                  </span>
                </span>
                <ChevronDown className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </button>

              {isOpen && (
                <div className="space-y-4 border-t p-4">
                  {isAdmin ? (
                    <p className="text-sm text-muted-foreground">Admins can use every option, including ones added later. This role cannot be changed or deleted, so you can never lock yourself out.</p>
                  ) : (
                    <>
                      {GROUPS.map((g) => (
                        <fieldset key={g} className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <legend className="text-sm font-semibold">{g}</legend>
                            <span className="flex gap-3 text-xs">
                              <button type="button" className="text-primary hover:underline" onClick={() => setGroup(r.key, g, true)}>All</button>
                              <button type="button" className="text-primary hover:underline" onClick={() => setGroup(r.key, g, false)}>None</button>
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">{GROUP_HELP[g]}</p>
                          {FEATURES.filter((f) => f.group === g).map((f) => (
                            <label key={f.key} className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 hover:bg-accent/50">
                              <input type="checkbox" className="mt-1 h-4 w-4" checked={draft[r.key]?.has(f.key) ?? false} onChange={() => toggle(r.key, f.key)} />
                              <span className="min-w-0">
                                <span className="flex items-center gap-2 text-sm font-medium">
                                  {f.label}
                                  {fresh.has(f.key) && <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">NEW</span>}
                                </span>
                                <span className="block text-xs text-muted-foreground">{f.description}</span>
                              </span>
                            </label>
                          ))}
                        </fieldset>
                      ))}
                      <div className="flex flex-wrap items-center gap-2">
                        <Button type="button" disabled={busy === r.key || (!dirty(r) && fresh.size === 0)} onClick={() => save(r)} className="gap-2">
                          {busy === r.key && <Loader2 className="h-4 w-4 animate-spin" />}
                          {fresh.size > 0 && !dirty(r) ? "Save & mark reviewed" : "Save access"}
                        </Button>
                        {!r.is_system && (
                          <Button type="button" variant="ghost" className="gap-2 text-red-600 hover:text-red-600" disabled={busy === r.key} onClick={() => remove(r)}>
                            <Trash2 className="h-4 w-4" /> Delete role
                          </Button>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">Changes apply the next time the person opens a page. Menus and page access follow these options.</p>
                    </>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
