"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UserPlus, Copy, Check, Shield, User, Mail, UserCog } from "lucide-react";
import type { UserRole } from "@/lib/roles";
import { canAssignRole } from "@/lib/roles";

interface ManagedUser {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  role: string;
  must_change_password: boolean;
  created_at: string;
}

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let result = "";
  for (let i = 0; i < 12; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export default function AdminUsersPage() {
  const supabase = createClient();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<UserRole>("user");

  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState<UserRole>("user");
  const [tempPassword, setTempPassword] = useState("");
  const [createdEmail, setCreatedEmail] = useState("");
  const [showCredentials, setShowCredentials] = useState(false);
  const [copied, setCopied] = useState(false);

  const loadUsers = async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data: me } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      if (me?.role) setMyRole(me.role as UserRole);
    }

    const { data, error } = await supabase
      .from("profiles")
      .select(
        "id, email, first_name, last_name, full_name, role, must_change_password, created_at"
      )
      .order("created_at", { ascending: false });

    if (!error && data) {
      setUsers(data as ManagedUser[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    setSuccess(null);
    setShowCredentials(false);

    // Assistants can only create regular users
    const assignedRole = canAssignRole(myRole) ? role : "user";
    const password = generateTempPassword();

    try {
      const res = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          firstName,
          lastName,
          role: assignedRole,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to create user");
      }

      setTempPassword(password);
      setCreatedEmail(email);
      setShowCredentials(true);
      setSuccess(`User ${email} created successfully`);
      setEmail("");
      setFirstName("");
      setLastName("");
      setRole("user");
      await loadUsers();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create user";
      setError(message);
    } finally {
      setCreating(false);
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

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">User Management</h1>
        <p className="text-muted-foreground mt-1">
          Create accounts and manage access. Public signup is disabled.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Create User
          </CardTitle>
          <CardDescription>
            A temporary password is generated. The user must change it on first login.
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
                <Input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="John"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Last name</label>
                <Input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Doe"
                />
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
                  <option value="assistant">
                    Assistant — Same as User + create users (not roles)
                  </option>
                  <option value="admin">Admin — Full access</option>
                </select>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                New accounts will be created as <strong>User</strong>.
              </p>
            )}

            {error && (
              <p className="text-sm text-red-600 bg-red-50 p-3 rounded-md">{error}</p>
            )}
            {success && !showCredentials && (
              <p className="text-sm text-green-600 bg-green-50 p-3 rounded-md">{success}</p>
            )}

            {showCredentials && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
                <p className="text-sm font-medium text-amber-900">
                  Share these credentials securely. Do not send over insecure channels.
                </p>
                <div className="bg-white rounded-md border p-3 font-mono text-sm space-y-1">
                  <p>
                    <span className="text-muted-foreground">Email:</span> {createdEmail}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Temp password:</span>{" "}
                    {tempPassword}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => {
                    navigator.clipboard.writeText(
                      `Email: ${createdEmail}\nTemporary password: ${tempPassword}\n\nYou must set a new password when you first sign in.`
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

            <Button type="submit" disabled={creating} className="gap-2">
              <UserPlus className="h-4 w-4" />
              {creating ? "Creating..." : "Create user"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All users</CardTitle>
          <CardDescription>
            {users.length} account{users.length !== 1 ? "s" : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-sm">Loading...</p>
          ) : users.length === 0 ? (
            <p className="text-muted-foreground text-sm">No users yet</p>
          ) : (
            <div className="space-y-2">
              {users.map((u) => {
                const name =
                  [u.first_name, u.last_name].filter(Boolean).join(" ") ||
                  u.full_name ||
                  "—";

                return (
                  <div
                    key={u.id}
                    className="flex items-center justify-between p-3 rounded-lg border"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                        {roleIcon(u.role)}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium truncate">{name}</p>
                        <p className="text-sm text-muted-foreground flex items-center gap-1 truncate">
                          <Mail className="h-3 w-3" />
                          {u.email}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {u.must_change_password && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                          Must change password
                        </span>
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded-full ${roleBadge(u.role)}`}>
                        {u.role}
                      </span>
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
