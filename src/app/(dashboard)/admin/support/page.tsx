"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LifeBuoy, Mail, Check, Trash2, RotateCcw, RefreshCw } from "lucide-react";

type SupportRequest = {
  id: string;
  name: string;
  email: string;
  subject: string | null;
  message: string;
  status: "new" | "resolved";
  created_at: string;
};

const fmt = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

export default function AdminSupportPage() {
  const supabase = createClient();
  const [rows, setRows] = useState<SupportRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"new" | "resolved" | "all">("new");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("support_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      setError(
        /relation|does not exist|schema cache/i.test(error.message)
          ? "Support table not found. Run supabase/migration_login_support.sql in the Supabase SQL Editor."
          : error.message
      );
    } else {
      setError(null);
      setRows((data as SupportRequest[]) || []);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const setStatus = async (id: string, status: "new" | "resolved") => {
    const { error } = await supabase.from("support_requests").update({ status }).eq("id", id);
    if (error) setError(error.message);
    else setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status } : r)));
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this message permanently?")) return;
    const { error } = await supabase.from("support_requests").delete().eq("id", id);
    if (error) setError(error.message);
    else setRows((rs) => rs.filter((r) => r.id !== id));
  };

  const newCount = rows.filter((r) => r.status === "new").length;
  const shown = rows.filter((r) => filter === "all" || r.status === filter);

  return (
    <div className="p-4 md:p-8 pb-24 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
          <LifeBuoy className="h-7 w-7" />
          Support Requests
        </h1>
        <p className="text-muted-foreground mt-1">Messages sent from the Contact Support form on the login screen.</p>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-md">{error}</p>}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle>Inbox</CardTitle>
            <CardDescription>{newCount} new</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {(["new", "resolved", "all"] as const).map((f) => (
              <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)} className="capitalize">
                {f}
              </Button>
            ))}
            <Button size="sm" variant="outline" onClick={load} disabled={loading} aria-label="Refresh">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading && rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : shown.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Nothing here.</p>
          ) : (
            shown.map((r) => (
              <div key={r.id} className="rounded-lg border p-4 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">{r.subject || "(no subject)"}</p>
                    <p className="text-sm text-muted-foreground">
                      {r.name} · {r.email} · {fmt(r.created_at)}
                    </p>
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      r.status === "new" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-700"
                    }`}
                  >
                    {r.status}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap break-words">{r.message}</p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <a
                    href={`mailto:${r.email}?subject=${encodeURIComponent(`Re: ${r.subject || "Your support request"}`)}`}
                    className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm hover:bg-accent"
                  >
                    <Mail className="h-4 w-4" /> Reply
                  </a>
                  {r.status === "new" ? (
                    <Button size="sm" variant="outline" className="gap-2" onClick={() => setStatus(r.id, "resolved")}>
                      <Check className="h-4 w-4" /> Mark resolved
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" className="gap-2" onClick={() => setStatus(r.id, "new")}>
                      <RotateCcw className="h-4 w-4" /> Reopen
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="text-red-600" onClick={() => remove(r.id)}>
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
