"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, Clock, Copy } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import { TEMP_PASSWORD_TTL_HOURS } from "@/lib/temp-password-config";
import type { Credentials } from "@/components/admin/user-status";

const fmt = formatDateTime;

export function CredentialsPanel({ credentials }: { credentials: Credentials }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3 dark:border-amber-900/60 dark:bg-amber-950/50">
      <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
        Share these credentials securely. The password is shown only once.
      </p>
      <div className="bg-white rounded-xl border p-3 font-mono text-sm space-y-1 break-all">
        <p>
          <span className="text-muted-foreground">Email:</span> {credentials.email}
        </p>
        <p>
          <span className="text-muted-foreground">Temp password:</span> {credentials.password}
        </p>
      </div>
      <p className="text-sm text-amber-900 flex items-center gap-1.5 dark:text-amber-100">
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
  );
}
