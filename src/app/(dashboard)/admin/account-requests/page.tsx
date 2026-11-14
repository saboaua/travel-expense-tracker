"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAccess } from "@/lib/use-access";
import { formatDateTime } from "@/lib/utils";

type Req = { id: string; name: string; email: string | null; phone: string | null; status: "new" | "done" | "dismissed"; created_at: string };

export default function AccountRequestsPage() {
  const { role, loaded } = useAccess();
  const [rows, setRows] = useState<Req[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/admin/account-requests").then((r) => r.json()).then((d) => { if (d.error) setError(d.error); else setRows(d.requests); }).catch(() => setError("Could not load the requests."));
  }, []);
  useEffect(() => { if (role === "admin") load(); }, [role, load]);

  const mark = async (id: string, status: Req["status"]) => {
    setBusy(id); setError(null);
    const res = await fetch("/api/admin/account-requests", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error || "Could not save that.");
    setBusy(null); load();
  };
  const createHref = (r: Req) => {
    const [first, ...rest] = r.name.split(" ");
    const q = new URLSearchParams({ first, last: rest.join(" "), ...(r.email ? { email: r.email } : {}) });
    return `/admin/users?${q.toString()}`;
  };

  if (loaded && role !== "admin") return <div className="p-4 md:p-8"><Alert>Only an admin can see account requests.</Alert></div>;
  const waiting = rows?.filter((r) => r.status === "new").length ?? 0;
  return (
    <div className="p-4 md:p-8 pb-24 max-w-2xl mx-auto space-y-4">
      <PageHeader title="Account requests" description={rows ? `${waiting} waiting` : "People who asked for an account on the sign-in screen"} />
      {error && <Alert variant="error">{error}</Alert>}
      {rows?.length === 0 && <Alert variant="info">No requests yet. They appear here when someone uses Request one on the sign-in screen.</Alert>}
      <ul className="space-y-3" data-testid="request-list">
        {rows?.map((r) => (
          <li key={r.id}>
            <Card><CardContent className="space-y-2 p-4">
              <div className="flex items-center justify-between gap-2">
                <b className="text-base">{r.name}</b>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${r.status === "new" ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-600"}`}>{r.status === "new" ? "New" : r.status === "done" ? "Handled" : "Dismissed"}</span>
              </div>
              <p className="text-sm">{[r.email, r.phone].filter(Boolean).join(" · ")}</p>
              <p className="text-xs text-muted-foreground">{formatDateTime(r.created_at)}</p>
              {r.status === "new" ? (
                <div className="flex gap-2 pt-1">
                  <Link href={createHref(r)} className="flex-1" onClick={() => mark(r.id, "done")}><Button className="h-11 w-full">Create account</Button></Link>
                  <Button variant="outline" className="h-11 flex-1" disabled={busy === r.id} onClick={() => mark(r.id, "dismissed")}>Dismiss</Button>
                </div>
              ) : (
                <Button variant="ghost" size="sm" disabled={busy === r.id} onClick={() => mark(r.id, "new")}>Move back to New</Button>
              )}
            </CardContent></Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
