"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Shield, AlertTriangle, Activity, Globe, RefreshCw, Filter } from "lucide-react";

interface SecurityEvent {
  id: string;
  event_type: string;
  severity: string;
  email_attempted: string | null;
  user_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  origin: string | null;
  country: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

interface AuditLog {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  origin: string | null;
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
    suspicious: "Suspicious activity",
    rate_limit: "Rate limited",
  };
  return map[type] || type;
}

export default function AdminSecurityPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<"security" | "audit">("security");
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [audits, setAudits] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [secError, setSecError] = useState<string | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState("");
  const [filterSeverity, setFilterSeverity] = useState("");
  const [filterIp, setFilterIp] = useState("");
  const [filterEmail, setFilterEmail] = useState("");
  const [days, setDays] = useState(7);
  const [stats, setStats] = useState({ failedLogins: 0, successfulLogins: 0, bruteForce: 0, uniqueIps: 0 });

  const load = useCallback(async () => {
    setLoading(true);
    setSecError(null);
    setAuditError(null);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    let secQuery = supabase.from("security_events").select("*").gte("created_at", since).order("created_at", { ascending: false }).limit(200);
    if (filterType) secQuery = secQuery.eq("event_type", filterType);
    if (filterSeverity) secQuery = secQuery.eq("severity", filterSeverity);
    if (filterIp) secQuery = secQuery.ilike("ip_address", `%${filterIp}%`);
    if (filterEmail) secQuery = secQuery.ilike("email_attempted", `%${filterEmail}%`);

    const { data: secData, error: secErr } = await secQuery;
    if (secErr) setSecError(secErr.message);
    setEvents((secData as SecurityEvent[]) || []);

    const { data: allSec } = await supabase.from("security_events").select("event_type, ip_address").gte("created_at", since);
    if (allSec) {
      const ips = new Set(allSec.map((e) => e.ip_address).filter(Boolean));
      setStats({
        failedLogins: allSec.filter((e) => e.event_type === "login_failed").length,
        successfulLogins: allSec.filter((e) => e.event_type === "login_success").length,
        bruteForce: allSec.filter((e) => e.event_type === "brute_force").length,
        uniqueIps: ips.size,
      });
    }

    let auditQuery = supabase.from("audit_logs").select("*").gte("created_at", since).order("created_at", { ascending: false }).limit(200);
    if (filterEmail) auditQuery = auditQuery.ilike("actor_email", `%${filterEmail}%`);
    if (filterIp) auditQuery = auditQuery.ilike("ip_address", `%${filterIp}%`);

    const { data: auditData, error: auditErr } = await auditQuery;
    if (auditErr) setAuditError(auditErr.message);
    setAudits((auditData as AuditLog[]) || []);
    setLoading(false);
  }, [supabase, days, filterType, filterSeverity, filterIp, filterEmail]);

  useEffect(() => {
    load();
  }, [load]);

  const failedByDay: Record<string, number> = {};
  events.filter((e) => e.event_type === "login_failed").forEach((e) => {
    const day = e.created_at.slice(0, 10);
    failedByDay[day] = (failedByDay[day] || 0) + 1;
  });
  const chartDays = Object.keys(failedByDay).sort().slice(-7);
  const maxBar = Math.max(...Object.values(failedByDay), 1);

  return (
    <div className="p-4 md:p-8 pb-24 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <Shield className="h-7 w-7" /> Security & Audit
          </h1>
          <p className="text-muted-foreground mt-1">Monitor logins, intrusion attempts, and user actions</p>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {(secError || auditError) && (
        <p className="text-sm text-red-600 bg-red-50 p-3 rounded-md">
          {secError && `Security events: ${secError}. `}
          {auditError && `Audit trail: ${auditError}. `}
          If the table is missing, run supabase/migration_audit.sql in the SQL Editor.
        </p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardHeader className="pb-2"><CardDescription>Failed logins</CardDescription></CardHeader><CardContent><p className="text-2xl font-bold text-amber-600">{stats.failedLogins}</p><p className="text-xs text-muted-foreground">Last {days} days</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Successful logins</CardDescription></CardHeader><CardContent><p className="text-2xl font-bold text-green-600">{stats.successfulLogins}</p><p className="text-xs text-muted-foreground">Last {days} days</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Brute-force alerts</CardDescription></CardHeader><CardContent><p className="text-2xl font-bold text-red-600">{stats.bruteForce}</p><p className="text-xs text-muted-foreground">Last {days} days</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Unique IPs</CardDescription></CardHeader><CardContent><p className="text-2xl font-bold">{stats.uniqueIps}</p><p className="text-xs text-muted-foreground">Last {days} days</p></CardContent></Card>
      </div>

      {chartDays.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Failed logins by day</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-end gap-2 h-24">
              {chartDays.map((day) => (
                <div key={day} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full bg-amber-400 rounded-t min-h-[4px]" style={{ height: `${(failedByDay[day] / maxBar) * 100}%` }} title={`${day}: ${failedByDay[day]}`} />
                  <span className="text-[10px] text-muted-foreground">{day.slice(8)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Filter className="h-4 w-4" /> Filters</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
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
              <label className="text-xs text-muted-foreground">Severity</label>
              <select value={filterSeverity} onChange={(e) => setFilterSeverity(e.target.value)} className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
                <option value="">All</option>
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">IP address</label>
              <Input value={filterIp} onChange={(e) => setFilterIp(e.target.value)} placeholder="e.g. 1.2.3" className="mt-1 h-9" />
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
            {loading ? <p className="text-sm text-muted-foreground">Loading...</p> : events.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No security events in this period. Logins are recorded when someone signs in or out. If you have been logged in the whole time, sign out and back in to create one.
              </p>
            ) : (
              <div className="space-y-2 max-h-[480px] overflow-y-auto">
                {events.map((e) => (
                  <div key={e.id} className="flex flex-col sm:flex-row sm:items-start gap-2 p-3 rounded-lg border text-sm">
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${severityColor(e.severity)}`}>{e.severity}</span>
                      <span className="font-medium">{eventLabel(e.event_type)}</span>
                    </div>
                    <div className="flex-1 min-w-0 space-y-0.5">
                      {e.email_attempted && <p className="text-muted-foreground truncate">Email: {e.email_attempted}</p>}
                      <p className="text-xs text-muted-foreground">IP: {e.ip_address || "\u2014"}{e.country && ` \u00b7 ${e.country}`}</p>
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
            {loading ? <p className="text-sm text-muted-foreground">Loading...</p> : audits.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No audit entries in this period. Run supabase/migration_audit_triggers.sql so trip and expense changes are logged, including ones already saved.
              </p>
            ) : (
              <div className="space-y-2 max-h-[480px] overflow-y-auto">
                {audits.map((a) => (
                  <div key={a.id} className="flex flex-col sm:flex-row sm:items-start gap-2 p-3 rounded-lg border text-sm">
                    <div className="shrink-0">
                      <span className="font-medium">{a.action}</span>
                      {a.entity_type && <span className="text-muted-foreground text-xs ml-2">{a.entity_type}</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-muted-foreground truncate">{a.actor_email || a.actor_id || "system"}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {a.details?.merchant ? String(a.details.merchant) : a.details?.name ? String(a.details.name) : ""}
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
