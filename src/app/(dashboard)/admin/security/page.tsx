"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Shield, AlertTriangle, Activity, Globe, RefreshCw, Filter, X } from "lucide-react";

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

function today() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgo(n: number) {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
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
    login_blocked: "Login blocked (lockout)",
    suspicious_input: "Suspicious input",
    csp_violation: "CSP violation (report)",
    access_denied: "Access denied",
    temp_password_expired: "Expired temp password used",
    password_changed: "Password changed",
    support_spam: "Support form spam",
    rate_limit: "Rate limit hit",
  };
  return map[type] || type;
}

const selectClass = "mt-1 flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm";

export default function AdminSecurityPage() {
  const [tab, setTab] = useState<"security" | "audit">("security");
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [audits, setAudits] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState(daysAgo(7));
  const [to, setTo] = useState(today());
  const [eventType, setEventType] = useState("");
  const [severity, setSeverity] = useState("");
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [email, setEmail] = useState("");
  const [ip, setIp] = useState("");
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ from, to });
      if (eventType) params.set("eventType", eventType);
      if (severity) params.set("severity", severity);
      if (action) params.set("action", action);
      if (entityType) params.set("entityType", entityType);
      if (email) params.set("email", email);
      if (ip) params.set("ip", ip);
      const res = await fetch(`/api/admin/security?${params}`);
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
  }, [from, to, eventType, severity, action, entityType, email, ip]);

  useEffect(() => {
    load();
  }, [load]);

  const setRange = (days: number) => {
    setFrom(daysAgo(days));
    setTo(today());
  };

  const clearFilters = () => {
    setFrom(daysAgo(7));
    setTo(today());
    setEventType("");
    setSeverity("");
    setAction("");
    setEntityType("");
    setEmail("");
    setIp("");
  };

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

  const stats = {
    failed: events.filter((e) => e.event_type === "login_failed").length,
    success: events.filter((e) => e.event_type === "login_success").length,
    brute: events.filter((e) => e.event_type === "brute_force").length,
    blocked: events.filter((e) => e.event_type === "login_blocked").length,
    suspicious: events.filter((e) => e.event_type === "suspicious_input").length,
    denied: events.filter((e) => e.event_type === "access_denied").length,
    pwChanges: events.filter((e) => e.event_type === "password_changed").length,
    ips: new Set(events.map((e) => e.ip_address).filter(Boolean)).size,
  };

  return (
    <div className="p-4 md:p-8 pb-24 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <Shield className="h-7 w-7" /> Security & Audit
          </h1>
          <p className="text-muted-foreground mt-1">Filter logins, threats, and user actions</p>
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardHeader className="pb-2"><CardDescription>Blocked logins</CardDescription></CardHeader><CardContent><p className="text-2xl font-bold text-red-600">{stats.blocked}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Suspicious input</CardDescription></CardHeader><CardContent><p className="text-2xl font-bold text-amber-600">{stats.suspicious}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Access denied</CardDescription></CardHeader><CardContent><p className="text-2xl font-bold text-amber-600">{stats.denied}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Password changes</CardDescription></CardHeader><CardContent><p className="text-2xl font-bold">{stats.pwChanges}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><Filter className="h-4 w-4" /> Filters</CardTitle>
          <Button type="button" variant="ghost" size="sm" className="gap-1" onClick={clearFilters}>
            <X className="h-3.5 w-3.5" /> Clear
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {[1, 7, 30, 90].map((d) => (
              <button key={d} type="button" onClick={() => setRange(d)} className="h-8 px-3 rounded-md border text-xs hover:bg-accent">
                {d === 1 ? "Last 24h" : `Last ${d} days`}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">From</label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 h-9" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">To</label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 h-9" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Email</label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@..." className="mt-1 h-9" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">IP address</label>
              <Input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="1.2.3" className="mt-1 h-9" />
            </div>
          </div>

          {tab === "security" ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Event</label>
                <select value={eventType} onChange={(e) => setEventType(e.target.value)} className={selectClass}>
                  <option value="">All events</option>
                  <option value="login_success">Login success</option>
                  <option value="login_failed">Login failed</option>
                  <option value="logout">Logout</option>
                  <option value="brute_force">Brute force</option>
                  <option value="login_blocked">Login blocked</option>
                  <option value="suspicious_input">Suspicious input</option>
                  <option value="csp_violation">CSP violation</option>
                  <option value="access_denied">Access denied</option>
                  <option value="temp_password_expired">Expired temp password</option>
                  <option value="password_changed">Password changed</option>
                  <option value="support_spam">Support form spam</option>
                  <option value="rate_limit">Rate limit</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Severity</label>
                <select value={severity} onChange={(e) => setSeverity(e.target.value)} className={selectClass}>
                  <option value="">All severities</option>
                  <option value="info">Info</option>
                  <option value="warning">Warning</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Action</label>
                <select value={action} onChange={(e) => setAction(e.target.value)} className={selectClass}>
                  <option value="">All actions</option>
                  <option value="created">Created</option>
                  <option value="updated">Updated</option>
                  <option value="deleted">Deleted</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Record</label>
                <select value={entityType} onChange={(e) => setEntityType(e.target.value)} className={selectClass}>
                  <option value="">All records</option>
                  <option value="expenses">Expenses</option>
                  <option value="trips">Trips</option>
                  <option value="user">Users</option>
                </select>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-2 border-b">
        <button onClick={() => setTab("security")} className={`px-4 py-2 text-sm font-medium border-b-2 ${tab === "security" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>
          <Activity className="h-4 w-4 inline mr-1.5" /> Security events ({events.length})
        </button>
        <button onClick={() => setTab("audit")} className={`px-4 py-2 text-sm font-medium border-b-2 ${tab === "audit" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>
          <Globe className="h-4 w-4 inline mr-1.5" /> Audit trail ({audits.length})
        </button>
      </div>

      {tab === "security" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Security events</CardTitle>
            <CardDescription>{events.length} result{events.length === 1 ? "" : "s"} from {from} to {to}</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? <p className="text-sm text-muted-foreground">Loading...</p> : events.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No security events match these filters.</p>
            ) : (
              <div className="space-y-2 max-h-[520px] overflow-y-auto">
                {events.map((e) => (
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
            <CardDescription>{audits.length} result{audits.length === 1 ? "" : "s"} from {from} to {to}</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? <p className="text-sm text-muted-foreground">Loading...</p> : audits.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No audit entries match these filters.</p>
            ) : (
              <div className="space-y-2 max-h-[520px] overflow-y-auto">
                {audits.map((a) => (
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
