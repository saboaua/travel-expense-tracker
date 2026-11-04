"use client";

import { formatDateTime } from "@/lib/utils";
import { Select } from "@/components/ui/select";
import { useConfirm } from "@/components/ui/confirm";
import { Alert } from "@/components/ui/alert";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UserPlus, Shield, User, Mail, UserCog, KeyRound, RefreshCw } from "lucide-react";
import type { UserRole } from "@/lib/roles";
import { canAssignRole } from "@/lib/roles";
import { TEMP_PASSWORD_TTL_HOURS } from "@/lib/temp-password-config";
import { RolesManager, type RoleSummary } from "@/components/admin/RolesManager";
import { CredentialsPanel } from "@/components/admin/CredentialsPanel";
import { statusOf, timeAgo, type Credentials, type ManagedUser } from "@/components/admin/user-status";


const fmt = formatDateTime;

export default function AdminUsersPage() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<UserRole>("user");
  const [tab, setTab] = useState<"users" | "roles">("users");
  const [roles, setRoles] = useState<RoleSummary[]>([]);

  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState<UserRole>("user");
  const [credentials, setCredentials] = useState<Credentials | null>(null);

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

  // Roles list (admin only) feeds the Role pickers; falls back to the 3 built-in roles before the roles migration
  const loadRoles = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/roles", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.roles)) setRoles(data.roles as RoleSummary[]);
    } catch {
      // keep the fallback list
    }
  }, []);

  useEffect(() => {
    if (canAssignRole(myRole)) loadRoles();
  }, [myRole, loadRoles]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") === "roles") setTab("roles");
  }, []);

  const roleOptions = roles.length
    ? roles
    : ([
        { key: "user", label: "User", description: "Dashboard, trips, reports, personal and documents." },
        { key: "assistant", label: "Assistant", description: "Same as User, and can create users." },
        { key: "admin", label: "Admin", description: "Full access." },
      ] as RoleSummary[]);

  const confirm = useConfirm();
  const changeRole = async (u: ManagedUser, next: string) => {
    if (next === u.role) return;
    if (!(await confirm({ title: "Change role?", message: `Change ${u.email}'s role to ${roleOptions.find((r) => r.key === next)?.label ?? next}?`, confirmLabel: "Change role" }))) return;
    setBusyId(u.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${u.id}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not change the role");
      await loadUsers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not change the role");
    } finally {
      setBusyId(null);
    }
  };

  const showCredentials = (c: Credentials) => {
    setCredentials(c);
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
    if (!(await confirm({ title: "Generate new password?", message: `Generate a new temporary password for ${u.email}? Their current password stops working immediately.`, confirmLabel: "Generate" }))) return;
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
        <h1 className="text-2xl md:text-3xl font-bold">User Roles &amp; Users</h1>
        <p className="text-muted-foreground mt-1">Create accounts, choose each person&apos;s role, and decide what each role can use. Public signup is disabled.</p>
      </div>

      {canAssignRole(myRole) && (
        <div role="tablist" className="inline-flex rounded-xl border bg-muted p-1">
          {([["users", "Users"], ["roles", "Roles & access"]] as const).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${tab === id ? "bg-background shadow-sm" : "text-muted-foreground"}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {tab === "roles" && canAssignRole(myRole) ? (
        <RolesManager onChanged={() => { loadRoles(); loadUsers(); }} />
      ) : (
      <>

      {credentials && <CredentialsPanel key={credentials.password} credentials={credentials} />}

      {warning && <Alert variant="warning">{warning}</Alert>}
      {error && <Alert>{error}</Alert>}

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
                <Select
 value={role}
 onChange={(e) => setRole(e.target.value as UserRole)}

 >
                  {roleOptions.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.label}{r.description ? ` — ${r.description}` : ""}
                    </option>
                  ))}
                </Select>
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
                  <div key={u.id} className="p-3 rounded-xl border space-y-2">
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
                      {canAssignRole(myRole) && u.id !== meId ? (
                        <Select
 value={u.role}
 disabled={busyId === u.id}
 onChange={(e) => changeRole(u, e.target.value)}
 aria-label={`Role for ${u.email}`}
 className="w-auto min-w-fit h-8 shrink-0 px-2 text-xs py-0"
 >
                          {(roleOptions.some((r) => r.key === u.role) ? roleOptions : [...roleOptions, { key: u.role, label: u.role, description: "" }]).map((r) => (
                            <option key={r.key} value={r.key}>{r.label}</option>
                          ))}
                        </Select>
                      ) : (
                        <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${roleBadge(u.role)}`}>{roleOptions.find((r) => r.key === u.role)?.label ?? u.role}</span>
                      )}
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
      </>
      )}
    </div>
  );
}
