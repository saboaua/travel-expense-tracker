"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PasswordHints, PasswordInput } from "@/components/auth/PasswordInput";
import { PASSWORD_RULE, friendlyAuthError, passwordFormProblem, retryOnNetwork } from "@/lib/password-policy";
import { AccordionSection } from "@/components/ui/accordion";
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

    const problem = passwordFormProblem(newPassword, confirmPassword);
    if (problem) {
      setPwError(problem);
      return;
    }

    setPwLoading(true);
    try {
      const { error } = await retryOnNetwork(() => supabase.auth.updateUser({ password: newPassword }));
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
      setPwError(friendlyAuthError(err, "Failed to update password"));
    } finally {
      setPwLoading(false);
    }
  };

  return (
    <AccordionSection id="password" title="Password" icon={<Key />} summary="Change how you sign in" description="Update your account password">
        <form onSubmit={handlePasswordChange} noValidate className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="newPassword" className="text-sm font-medium">
              New Password
            </label>
            <PasswordInput
              id="newPassword"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              inputClassName="flex h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="confirmPassword" className="text-sm font-medium">
              Confirm New Password
            </label>
            <PasswordInput
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat new password"
              autoComplete="new-password"
              inputClassName="flex h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>

          <p className="text-xs text-muted-foreground">{PASSWORD_RULE}</p>
          <PasswordHints password={newPassword} confirm={confirmPassword} />

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
    </AccordionSection>
  );
}
