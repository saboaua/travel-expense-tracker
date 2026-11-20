"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AuthShell, NewPasswordForm } from "@/components/auth/NewPasswordForm";
import { retryOnNetwork } from "@/lib/password-policy";

/** First sign-in with a temporary password: a new one must be set before anything else opens. */
export default function ChangePasswordPage() {
  const router = useRouter();
  const supabase = createClient();

  const save = async (password: string) => {
    const { error: updateError } = await retryOnNetwork(() => supabase.auth.updateUser({ password }));

    if (updateError) throw updateError;

    const {
      data: { user },
    } = await retryOnNetwork(() => supabase.auth.getUser());

    if (user) {
      const { error: clearErr } = await retryOnNetwork(async () => await supabase
        .from("profiles")
        .update({
          must_change_password: false,
          temp_password_expires_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id));
      if (clearErr) {
        // Expiry column missing (migration not run yet): clear the flag alone
        const { error: flagErr } = await supabase
          .from("profiles")
          .update({ must_change_password: false, updated_at: new Date().toISOString() })
          .eq("id", user.id);
        // Without this the person would be sent straight back to this page after a "successful" change
        if (flagErr) throw flagErr;
      }
    }

    fetch("/api/auth/password-changed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "first_login" }),
    }).catch(() => {});

    router.push("/");
    router.refresh();
  };

  return (
    <AuthShell>
      <NewPasswordForm
        title="Create a new password"
        subtitle="For security, you must set a new password before continuing"
        submitLabel="Set new password & continue"
        busyLabel="Updating..."
        onSave={save}
        footer={<p className="mt-6 text-xs text-slate-400 text-center">Use a unique password you don&apos;t use elsewhere.</p>}
      />
    </AuthShell>
  );
}
