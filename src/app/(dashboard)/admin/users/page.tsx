"use client";

import { Tabs } from "@/components/ui/tabs";
import { PageHeader } from "@/components/ui/page-header";
import { scrollAreaOrWindow } from "@/components/layout/ScrollArea";
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
import { Switch } from "@/components/ui/switch";
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
  // How the new person gets the temporary login: emailed, shown here, or both
  const [emailIt, setEmailIt] = useState(false);
  const [showIt, setShowIt] = useState(true);
  const [emailReady, setEmailReady] = useState<boolean | null>(null);
  const [emailNote, setEmailNote] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [testing, setTesting] = useState(false);

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

  // Arriving from Account requests: fill in the name and email that person gave
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("email")) setEmail(q.get("email")!);
    if (q.get("first")) setFirstName(q.get("first")!);
    if (q.get("last")) setLastName(q.get("last")!);
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    fetch("/api/admin/email", { cache: "no-store" }).then((r) => r.json()).then((d) => setEmailReady(!!d.configured)).catch(() => setEmailReady(false));
  }, []);

  const sendTest = async () => {
    setTesting(true);
    setEmailNote(null);
    try {
      const res = await fetch("/api/admin/email", { method: "POST" });
      const d = await res.json();
      setEmailNote(res.ok ? { tone: "ok", text: `Test email sent to ${d.to}.` } : { tone: "bad", text: d.error || "The test email was not sent." });
    } catch {
      setEmailNote({ tone: "bad", text: "The test email was not sent." });
    } finally {
      setTesting(false);
    }
  };

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

  const canManage = (u: ManagedUser) => u.id !== meId && (canAssignRole(myRole) || u.role === "user");
  const nameOf = (u: ManagedUser) => [u.first_name, u.last_name].filter(Boolean).join(" ") || u.full_name || u.email || "this person";
  const toggleSuspend = async (u: ManagedUser) => {
    const suspend = !u.suspended;
    const ok = await confirm(suspend
      ? { title: `Suspend ${nameOf(u)}?`, message: "They are signed out and cannot sign in. Nothing is deleted, and their phone alerts stop. You can restore them any time.", confirmLabel: "Suspend" }
      : { title: `Restore ${nameOf(u)}?`, message: "They can sign in again. They turn their phone alerts back on themselves.", confirmLabel: "Restore" });
    if (!ok) return;
    setBusyId(u.id); setError(null);
    try {
      const res = await fetch(`/api/admin/users/${u.id}/suspend`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ suspend }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not change that");
      await loadUsers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not change that");
    } finally {
      setBusyId(null);
    }
  };
  const [deleting, setDeleting] = useState<ManagedUser | null>(null);
  const [typed, setTyped] = useState("");
  const doDelete = async () => {
    if (!deleting) return;
    setBusyId(deleting.id); setError(null);
    try {
      const res = await fetch(`/api/admin/users/${deleting.id}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmEmail: typed }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not delete the person");
      setDeleting(null); setTyped("");
      await loadUsers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not delete the person");
      setDeleting(null); setTyped("");
    } finally {
      setBusyId(null);
    }
  };

  const showCredentials = (c: Credentials) => {
    setCredentials(c);
    scrollAreaOrWindow().scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    setWarning(null);
    setCredentials(null);
    setEmailNote(null);

    try {
      const res = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          firstName,
          lastName,
          role: canAssignRole(myRole) ? role : "user",
          delivery: { email: emailIt, show: showIt },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create user");

      if (emailIt && data.emailed) setEmailNote({ tone: "ok", text: `Login emailed to ${data.email}. It works for ${TEMP_PASSWORD_TTL_HOURS} hours.` });
      if (emailIt && !data.emailed) setEmailNote({ tone: "bad", text: `Email not sent: ${data.emailError || "the email service refused the message"}. The account was created. Copy the login below and send it yourself.` });
      if (data.tempPassword) showCredentials({ email: data.email, password: data.tempPassword, expiresAt: data.expiresAt });
      else scrollAreaOrWindow().scrollTo({ top: 0, behavior: "smooth" });
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
    if (r === "assistant") return "bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300";
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
      <PageHeader title="User Roles & Users" description="Create accounts, choose each person's role, and decide what each role can use. Public signup is disabled." />

      {canAssignRole(myRole) && (
        <Tabs label="Users and roles" value={tab} onChange={(id) => setTab(id as typeof tab)} options={[{ id: "users", label: "Users" }, { id: "roles", label: "Roles & access" }]} />
      )}

      {tab === "roles" && canAssignRole(myRole) ? (
        <RolesManager onChanged={() => { loadRoles(); loadUsers(); }} />
      ) : (
      <>

      {emailNote && <Alert variant={emailNote.tone === "ok" ? "success" : undefined} data-testid="email-note">{emailNote.text}</Alert>}
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
              <span className="block mt-1 text-amber-700 dark:text-amber-300">
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

            <fieldset className="rounded-xl border p-3 space-y-1" data-testid="delivery">
              <legend className="px-1 text-sm font-medium">How does the person get the login?</legend>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <p className="text-sm font-medium">Email it to them</p>
                  <p className="text-xs text-muted-foreground">
                    {emailReady === false ? "Email sending is not set up. Ask whoever manages Vercel to add the email key." : "Sent to the email above. The password is not shown on screen."}
                  </p>
                </div>
                <Switch label="Email it to them" checked={emailIt && emailReady === true} disabled={emailReady !== true} onChange={(v) => { setEmailIt(v); if (!v) setShowIt(true); }} />
              </div>
              <div className="flex items-center gap-3 border-t pt-1">
                <div className="flex-1">
                  <p className="text-sm font-medium">Show it here</p>
                  <p className="text-xs text-muted-foreground">You copy it and send it yourself.</p>
                </div>
                <Switch label="Show it here" checked={showIt} onChange={(v) => { setShowIt(v); if (!v && !emailIt) setEmailIt(emailReady === true); }} />
              </div>
              {canAssignRole(myRole) && emailReady && (
                <button type="button" onClick={sendTest} disabled={testing} className="text-xs font-semibold text-primary underline-offset-2 hover:underline disabled:opacity-50">
                  {testing ? "Sending..." : "Send me a test email"}
                </button>
              )}
            </fieldset>

            <Button type="submit" disabled={creating} className="gap-2">
              <UserPlus className="h-4 w-4" />
              {creating ? "Creating..." : emailIt && showIt ? "Create, email and show" : emailIt ? "Create and email login" : "Create user"}
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
                  <div key={u.id} className={`p-3 rounded-xl border space-y-2 ${u.suspended ? "border-red-200 bg-red-50/60 dark:border-red-900 dark:bg-red-950/20" : ""}`} data-testid={`user-row-${u.email}`}>
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
                        <span className="flex flex-wrap gap-1.5">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${status.cls}`}>{status.label}</span>
                          {u.suspended && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200" data-testid="suspended-badge">Suspended</span>}
                        </span>
                        <p className="text-xs text-muted-foreground">
                          Last login: {u.last_sign_in_at ? `${timeAgo(u.last_sign_in_at)} (${fmt(u.last_sign_in_at)})` : "never"}
                          {" · "}Created {fmt(u.created_at)}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                      {canManage(u) && (
                        <>
                          <Button size="sm" variant="outline" disabled={busyId === u.id} onClick={() => toggleSuspend(u)} data-testid={`suspend-${u.email}`}>{u.suspended ? "Restore" : "Suspend"}</Button>
                          <Button size="sm" variant="outline" className="border-red-300 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300" disabled={busyId === u.id} onClick={() => { setTyped(""); setDeleting(u); }} data-testid={`delete-${u.email}`}>Delete</Button>
                        </>
                      )}
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
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      </>
      )}
      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-4" role="dialog" aria-modal="true" aria-label={`Delete ${nameOf(deleting)}`} data-testid="delete-dialog">
          <div className="w-full max-w-md space-y-3 rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-900">
            <h2 className="text-lg font-bold text-red-700 dark:text-red-300">Delete {nameOf(deleting)}?</h2>
            <p className="text-sm text-muted-foreground">This cannot be undone.</p>
            <p className="rounded-xl bg-red-50 p-3 text-sm text-red-950 dark:bg-red-950/30 dark:text-red-100"><b>Removed:</b> the account, profile, receipts, trips, documents, cards, budgets, photos and files, sharing and alerts.</p>
            <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-950 dark:bg-emerald-950/30 dark:text-emerald-100"><b>Kept:</b> the prices they shared with the community (store, item and price only). Nothing links them to the person any more.</p>
            <div className="space-y-1">
              <label htmlFor="delete-confirm" className="text-sm">Type their email to confirm</label>
              <Input id="delete-confirm" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={deleting.email ?? ""} autoComplete="off" data-testid="delete-confirm-input" />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="h-11 flex-1" onClick={() => { setDeleting(null); setTyped(""); }}>Cancel</Button>
              <Button className="h-11 flex-1 bg-red-600 text-white hover:bg-red-700" disabled={busyId === deleting.id || typed.trim().toLowerCase() !== (deleting.email ?? "").toLowerCase()} onClick={doDelete} data-testid="delete-confirm">Delete for good</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
