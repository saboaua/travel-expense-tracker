"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Key } from "lucide-react";

export function PasswordCard() {
  const supabase = createClient();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwSaved, setPwSaved] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(null);
    setPwSaved(false);

    if (newPassword.length < 6) {
      setPwError("Password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError("Passwords do not match");
      return;
    }

    setPwLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      fetch("/api/auth/password-changed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "profile" }),
      }).catch(() => {});
      setPwSaved(true);
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setPwSaved(false), 4000);
    } catch (err: unknown) {
      setPwError(err instanceof Error ? err.message : "Failed to update password");
    } finally {
      setPwLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Key className="h-5 w-5" />
          Change Password
        </CardTitle>
        <CardDescription>Update your account password</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handlePasswordChange} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="newPassword" className="text-sm font-medium">
              New Password
            </label>
            <Input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 6 characters"
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="confirmPassword" className="text-sm font-medium">
              Confirm New Password
            </label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat new password"
              autoComplete="new-password"
            />
          </div>

          {pwError && (
            <Alert>{pwError}</Alert>
          )}
          {pwSaved && (
            <Alert variant="success">
              Password updated successfully
            </Alert>
          )}

          <Button type="submit" disabled={pwLoading}>
            {pwLoading ? "Updating..." : "Update Password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
