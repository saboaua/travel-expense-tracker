"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UserPlus, Copy, Check, Shield, User, Mail, UserCog, KeyRound, RefreshCw, Clock } from "lucide-react";
import type { UserRole } from "@/lib/roles";
import { canAssignRole } from "@/lib/roles";
import { TEMP_PASSWORD_TTL_HOURS } from "@/lib/temp-password-config";

interface ManagedUser {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  role: string;
  must_change_password: boolean;
  temp_password_expires_at: string | null;
  created_at: string;
  last_sign_in_at: string | null;
}

type Credentials = { email: string; password: string; expiresAt: string };

const fmt = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

function timeAgo(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days !== 1 ? "s" : ""} ago`;
}

function timeLeft(iso: string) {
  const mins = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  if (mins < 60) return `${Math.max(mins, 1)} min`;
  return `${Math.round(mins / 60)} h`;
}

type Status = { label: string; cls: string; needsNewPassword: boolean };

function statusOf(u: ManagedUser): Status {
  if (u.must_change_password) {
    const expired = u.temp_password_expires_at && new Date(u.temp_password_expires_at).getTime() < Date.now();
    if (expired) {
      return { label: "Temp password expired", cls: "bg-red-100 text-red-700", needsNewPassword: true };
    }
    return {
      label: u.temp_password_expires_at
        ? `Waiting for first login · expires in ${timeLeft(u.temp_password_expires_at)}`
        : "Waiting for first login",
      cls: "bg-amber-100 text-amber-800",
      needsNewPassword: false,
    };
  }
  return u.last_sign_in_at
    ? { label: "Active", cls: "bg-green-100 text-green-700", needsNewPassword: false }
    : { label: "Never signed in", cls: "bg-slate-100 text-slate-600", needsNewPassword: false };
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<UserRole>("user");

  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState<UserRole>("user");
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [copied, setCopied] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load users");
      setUsers(data.users as ManagedUser[]);
      setMeId(data.me?.id ?? null);
      if (data.me?.role) setMyRole(data.me.role as UserRole);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not load users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const showCredentials = (c: Credentials) => {
    setCredentials(c);
    setCopied(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    setWarning(null);
    setCredentials(null);

    try {
      const res = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          firstName,
          lastName,
          role: canAssignRole(myRole) ? role : "user",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create user");

      showCredentials({ email: data.email, password: data.tempPassword, expiresAt: data.expiresAt });
      if (data.warning) setWarning(data.warning);
      setEmail("");
      setFirstName("");
      setLastName("");
      setRole("user");
      await loadUsers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setCreating(false);
    }
  };

  const regenerate = async (u: ManagedUser) => {
    if (
      !confirm(
        `Generate a new temporary password for ${u.email}? Their current password stops working immediately.`
      )
    )
      return;
    setBusyId(u.id);
    setError(null);
    setWarning(null);
    try {
      const res = await fetch(`/api/admin/users/${u.id}/reset-password`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not reset password");
      showCredentials({ email: data.email, password: data.tempPassword, expiresAt: data.expiresAt });
      await loadUsers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not reset password");
    } finally {
      setBusyId(null);
    }
  };

  const roleBadge = (r: string) => {
    if (r === "admin") return "bg-indigo-100 text-indigo-700";
    if (r === "assistant") return "bg-violet-100 text-violet-700";
    return "bg-slate-100 text-slate-600";
  };

  const roleIcon = (r: string) => {
    if (r === "admin") return <Shield className="h-4 w-4 text-indigo-600" />;
    if (r === "assistant") return <UserCog className="h-4 w-4 text-violet-600" />;
    return <User className="h-4 w-4 text-muted-foreground" />;
  };

  const canReset = (u: ManagedUser) => u.id !== meId && (canAssignRole(myRole) || u.role === "user");

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">User Management</h1>
        <p className="text-muted-foreground mt-1">Create accounts and manage access. Public signup is disabled.</p>
      </div>

      {credentials && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
          <p className="text-sm font-medium text-amber-900">
            Share these credentials securely. The password is shown only once.
          </p>
          <div className="bg-white rounded-md border p-3 font-mono text-sm space-y-1 break-all">
            <p>
              <span className="text-muted-foreground">Email:</span> {credentials.email}
            </p>
            <p>
              <span className="text-muted-foreground">Temp password:</span> {credentials.password}
            </p>
          </div>
          <p className="text-sm text-amber-900 flex items-center gap-1.5">
            <Clock className="h-4 w-4" />
            Valid until {fmt(credentials.expiresAt)} ({TEMP_PASSWORD_TTL_HOURS} hours). It can be used once to set a new password.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => {
              navigator.clipboard.writeText(
                `Email: ${credentials.email}\nTemporary password: ${credentials.password}\n\nSign in and set a new password. This temporary password expires on ${fmt(credentials.expiresAt)}.`
              );
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            {copied ? (
              <>
                <Check className="h-4 w-4" /> Copied
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" /> Copy credentials
              </>
            )}
          </Button>
        </div>
      )}

      {warning && <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 p-3 rounded-md">{warning}</p>}
      {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-md">{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Create User
          </CardTitle>
          <CardDescription>
            A one-time temporary password is generated and expires after {TEMP_PASSWORD_TTL_HOURS} hours. The user must
            change it on first login. If it expires, generate a new one from the list below.
            {!canAssignRole(myRole) && (
              <span className="block mt-1 text-amber-700">
                As Assistant you can only create regular Users (not Admin or Assistant).
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">First name</label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="John" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Last name</label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Doe" />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Email *</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@company.com"
                required
              />
            </div>

            {canAssignRole(myRole) ? (
              <div className="space-y-2">
                <label className="text-sm font-medium">Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="user">User — Dashboard, Trips, Reports, Profile, Settings</option>
                  <option value="assistant">Assistant — Same as User + create users (not roles)</option>
                  <option value="admin">Admin — Full access</option>
                </select>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                New accounts will be created as <strong>User</strong>.
              </p>
            )}

            <Button type="submit" disabled={creating} className="gap-2">
              <UserPlus className="h-4 w-4" />
              {creating ? "Creating..." : "Create user"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle>All users</CardTitle>
            <CardDescription>
              {users.length} account{users.length !== 1 ? "s" : ""}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" className="gap-2" onClick={loadUsers} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {loading && users.length === 0 ? (
            <p className="text-muted-foreground text-sm">Loading...</p>
          ) : users.length === 0 ? (
            <p className="text-muted-foreground text-sm">No users yet</p>
          ) : (
            <div className="space-y-2">
              {users.map((u) => {
                const name = [u.first_name, u.last_name].filter(Boolean).join(" ") || u.full_name || "—";
                const status = statusOf(u);
                return (
                  <div key={u.id} className="p-3 rounded-lg border space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                          {roleIcon(u.role)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium truncate">{name}</p>
                          <p className="text-sm text-muted-foreground flex items-center gap-1 truncate">
                            <Mail className="h-3 w-3 shrink-0" />
                            {u.email}
                          </p>
                        </div>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${roleBadge(u.role)}`}>{u.role}</span>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pl-12">
                      <div className="space-y-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${status.cls}`}>{status.label}</span>
                        <p className="text-xs text-muted-foreground">
                          Last login: {u.last_sign_in_at ? `${timeAgo(u.last_sign_in_at)} (${fmt(u.last_sign_in_at)})` : "never"}
                          {" · "}Created {fmt(u.created_at)}
                        </p>
                      </div>
                      {canReset(u) && (
                        <Button
                          size="sm"
                          variant={status.needsNewPassword ? "default" : "outline"}
                          className="gap-2"
                          disabled={busyId === u.id}
                          onClick={() => regenerate(u)}
                        >
                          <KeyRound className="h-4 w-4" />
                          {busyId === u.id ? "Working..." : status.needsNewPassword ? "Generate new password" : "Reset password"}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
