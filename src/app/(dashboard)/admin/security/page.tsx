"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Shield, AlertTriangle, Activity, Globe, RefreshCw, Filter } from "lucide-react";

interface SecurityEvent {
  id: string;
  event_type: string;
  severity: string;
  email_attempted: string | null;
  ip_address: string | null;
  country: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

interface AuditLog {
  id: string;
  actor_email: string | null;
  actor_id: string | null;
  action: string;
  entity_type: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

function severityColor(s: string) {
  if (s === "critical") return "bg-red-100 text-red-800 border-red-200";
  if (s === "warning") return "bg-amber-100 text-amber-800 border-amber-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

function eventLabel(type: string) {
  const map: Record<string, string> = {
    login_success: "Login success",
    login_failed: "Login failed",
    logout: "Logout",
    brute_force: "Brute force detected",
  };
  return map[type] || type;
}

export default function AdminSecurityPage() {
  const [tab, setTab] = useState<"security" | "audit">("security");
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [audits, setAudits] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState("");
  const [filterEmail, setFilterEmail] = useState("");
  const [days, setDays] = useState(7);
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/security?days=${days}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load");
      setEvents(data.events || []);
      setAudits(data.audits || []);
      if (data.eventsError || data.auditsError) {
        setError([data.eventsError, data.auditsError].filter(Boolean).join(" \u00b7 "));
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not load");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  const testWrite = async () => {
    setTesting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/security", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Test write failed");
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Test write failed");
    } finally {
      setTesting(false);
    }
  };

  const shownEvents = events.filter((e) => {
    if (filterType && e.event_type !== filterType) return false;
    if (filterEmail && !(e.email_attempted || "").toLowerCase().includes(filterEmail.toLowerCase())) return false;
    return true;
  });
  const shownAudits = audits.filter((a) => {
    if (filterEmail && !(a.actor_email || "").toLowerCase().includes(filterEmail.toLowerCase())) return false;
    return true;
  });

  const stats = {
    failed: events.filter((e) => e.event_type === "login_failed").length,
    success: events.filter((e) => e.event_type === "login_success").length,
    brute: events.filter((e) => e.event_type === "brute_force").length,
    ips: new Set(events.map((e) => e.ip_address).filter(Boolean)).size,
  };

  return (
    <div className="p-4 md:p-8 pb-24 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <Shield className="h-7 w-7" /> Security & Audit
          </h1>
          <p className="text-muted-foreground mt-1">Monitor logins, intrusion attempts, and user actions</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={testWrite} disabled={testing}>
            {testing ? "Writing\u2026" : "Write test event"}
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 p-3 rounded-md">
          {error}
          <span className="block mt-1">If the table is missing, run supabase/migration_audit.sql in the SQL Editor.</span>
        </p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardHeader className="pb-2"><CardDescription>Failed logins</CardDescription></CardHeader><CardContent><p className="text-2xl font-bold text-amber-600">{stats.failed}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Successful logins</CardDescription></CardHeader><CardContent><p className="text-2xl font-bold text-green-600">{stats.success}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Brute-force alerts</CardDescription></CardHeader><CardContent><p className="text-2xl font-bold text-red-600">{stats.brute}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Unique IPs</CardDescription></CardHeader><CardContent><p className="text-2xl font-bold">{stats.ips}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Filter className="h-4 w-4" /> Filters</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Period</label>
              <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
                <option value={1}>Last 24h</option>
                <option value={7}>Last 7 days</option>
                <option value={30}>Last 30 days</option>
                <option value={90}>Last 90 days</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Event type</label>
              <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
                <option value="">All</option>
                <option value="login_failed">Login failed</option>
                <option value="login_success">Login success</option>
                <option value="logout">Logout</option>
                <option value="brute_force">Brute force</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Email</label>
              <Input value={filterEmail} onChange={(e) => setFilterEmail(e.target.value)} placeholder="user@..." className="mt-1 h-9" />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2 border-b">
        <button onClick={() => setTab("security")} className={`px-4 py-2 text-sm font-medium border-b-2 ${tab === "security" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>
          <Activity className="h-4 w-4 inline mr-1.5" /> Security events
        </button>
        <button onClick={() => setTab("audit")} className={`px-4 py-2 text-sm font-medium border-b-2 ${tab === "audit" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>
          <Globe className="h-4 w-4 inline mr-1.5" /> Audit trail
        </button>
      </div>

      {tab === "security" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Security events</CardTitle>
            <CardDescription>Failed logins, brute-force signals, and auth activity</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? <p className="text-sm text-muted-foreground">Loading...</p> : shownEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No security events in this period. Use Write test event to confirm the table is reachable.</p>
            ) : (
              <div className="space-y-2 max-h-[480px] overflow-y-auto">
                {shownEvents.map((e) => (
                  <div key={e.id} className="flex flex-col sm:flex-row sm:items-start gap-2 p-3 rounded-lg border text-sm">
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${severityColor(e.severity)}`}>{e.severity}</span>
                      <span className="font-medium">{eventLabel(e.event_type)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      {e.email_attempted && <p className="text-muted-foreground truncate">Email: {e.email_attempted}</p>}
                      <p className="text-xs text-muted-foreground">IP: {e.ip_address || "\u2014"}{e.country ? ` \u00b7 ${e.country}` : ""}</p>
                    </div>
                    <p className="text-xs text-muted-foreground shrink-0">{new Date(e.created_at).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "audit" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Audit trail</CardTitle>
            <CardDescription>Trips, expenses, and user changes</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? <p className="text-sm text-muted-foreground">Loading...</p> : shownAudits.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No audit entries in this period. Run supabase/migration_audit_triggers.sql so trip and expense changes are logged.</p>
            ) : (
              <div className="space-y-2 max-h-[480px] overflow-y-auto">
                {shownAudits.map((a) => (
                  <div key={a.id} className="flex flex-col sm:flex-row sm:items-start gap-2 p-3 rounded-lg border text-sm">
                    <span className="font-medium shrink-0">{a.action}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-muted-foreground truncate">{a.actor_email || a.actor_id || "system"}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {a.details?.merchant ? String(a.details.merchant) : a.details?.name ? String(a.details.name) : a.entity_type || ""}
                        {a.details?.amount != null ? ` \u00b7 ${String(a.details.amount)} ${String(a.details.currency || "")}` : ""}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground shrink-0">{new Date(a.created_at).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground flex items-center gap-1">
        <AlertTriangle className="h-3 w-3" /> Brute-force: 5+ failed logins from the same IP in 15 min = warning; 10+ = critical.
      </p>
    </div>
  );
}
