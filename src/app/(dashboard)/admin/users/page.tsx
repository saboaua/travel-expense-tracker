"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UserPlus, Copy, Check, Shield, User, Mail } from "lucide-react";

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
  // Readable temporary password: 3 words of random consonants+vowels + number
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

  // Form
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState<"user" | "admin">("user");
  const [tempPassword, setTempPassword] = useState("");
  const [showCredentials, setShowCredentials] = useState(false);
  const [copied, setCopied] = useState(false);

  const loadUsers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, first_name, last_name, full_name, role, must_change_password, created_at")
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

    const password = generateTempPassword();

    try {
      // Create user via Supabase Auth Admin API requires service role.
      // For security we use a server action / API route instead of client-side service key.
      const res = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          firstName,
          lastName,
          role,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to create user");
      }

      setTempPassword(password);
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

  const copyCredentials = () => {
    const text = `Login: ${email || "(see form)"}\nTemporary password: ${tempPassword}\n\nYou will be asked to set a new password on first login.`;
    navigator.clipboard.writeText(
      `Email: ${users[0]?.email || email}\nTemporary password: ${tempPassword}\n\nOn first login you must set a new password.`
    );
    // Better: copy the last created
    navigator.clipboard.writeText(
      `Email: ${email || "(check list)"}\nTemporary password: ${tempPassword}\n\nYou will be required to change this password when you first sign in.`
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">User Management</h1>
        <p className="text-muted-foreground mt-1">
          Create accounts and manage access. Public signup is disabled.
        </p>
      </div>

      {/* Create user */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Create User
          </CardTitle>
          <CardDescription>
            A temporary password is generated. Share it securely — the user must change it on first login.
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

            <div className="space-y-2">
              <label className="text-sm font-medium">Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as "user" | "admin")}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 p-3 rounded-md">{error}</p>
            )}
            {success && !showCredentials && (
              <p className="text-sm text-green-600 bg-green-50 p-3 rounded-md">{success}</p>
            )}

            {showCredentials && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
                <p className="text-sm font-medium text-amber-900">
                  Share these credentials securely (e.g. password manager or private message).
                  Do not send them over insecure channels.
                </p>
                <div className="bg-white rounded-md border p-3 font-mono text-sm space-y-1">
                  <p>
                    <span className="text-muted-foreground">Email:</span> {email || "—"}
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
                      `Email: ${email}\nTemporary password: ${tempPassword}\n\nYou must set a new password when you first sign in.`
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

      {/* Users list */}
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
                        {u.role === "admin" ? (
                          <Shield className="h-4 w-4 text-indigo-600" />
                        ) : (
                          <User className="h-4 w-4 text-muted-foreground" />
                        )}
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
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          u.role === "admin"
                            ? "bg-indigo-100 text-indigo-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
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
