"use client";

import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, Copy, ExternalLink, Send } from "lucide-react";
import Link from "next/link";
import { FEATURE_LABEL, featureLocked, type ProFeature } from "@/lib/limits";
import { useLimits } from "@/lib/use-limits";
import { todayISO } from "@/lib/utils";
import { useTelegramLink } from "@/components/profile/use-telegram-link";

export default function SettingsPage() {
  const supabase = createClient();
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lim = useLimits();
  const proOnly = (["telegram_save", "telegram_summary", "doc_reminders"] as ProFeature[]).filter((f) => !!lim && featureLocked(lim.limits, lim.who, f, todayISO()));
  const { featureOn, status, linking, copied, error: tgError, enable: enableTelegram, copyLink, disconnect } = useTelegramLink();

  useEffect(() => {
    async function loadProfile() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("profiles")
        .select("full_name, company_name")
        .eq("id", user.id)
        .single();

      if (data) {
        setFullName(data.full_name || "");
        setCompanyName(data.company_name || "");
      }
    }
    loadProfile();
  }, [supabase]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSaved(false);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("Not authenticated");
      setLoading(false);
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .upsert({
        id: user.id,
        full_name: fullName,
        company_name: companyName,
        updated_at: new Date().toISOString(),
      });

    if (error) setError(error.message);
    else {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
    setLoading(false);
  };

  return (
    <PageShell size="form">
      <PageHeader title="Settings" description={<>Profile and Telegram receipt upload</>} />

      <div className="space-y-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6 lg:space-y-0">
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Your personal and company information</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="fullName" className="text-sm font-medium">
                Full Name
              </label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="John Doe"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="company" className="text-sm font-medium">
                Company Name
              </label>
              <Input
                id="company"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Acme Inc."
              />
            </div>

            {error && (
              <Alert>{error}</Alert>
            )}
            {saved && (
              <Alert variant="success">
                Settings saved successfully
              </Alert>
            )}

            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : "Save Changes"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {featureOn && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              Telegram
            </CardTitle>
            <CardDescription>
              Enable it to get a personal link that opens the chatbot
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {proOnly.length > 0 && (
              <div className="rounded-xl border p-3 text-sm" data-testid="telegram-pro-only">
                <p className="font-semibold">Trip reminders are free for everyone.</p>
                <ul className="mt-2 divide-y">
                  {proOnly.map((f) => (<li key={f} className="flex items-center justify-between gap-3 py-2"><span>{FEATURE_LABEL[f]}</span><span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-extrabold text-amber-800 dark:bg-amber-950 dark:text-amber-200">Pro</span></li>))}
                </ul>
                <Link href="/personal/pro" className="mt-2 inline-flex min-h-10 items-center text-sm font-bold text-primary underline">Get Pro</Link>
              </div>
            )}
            <p className="text-sm">
              Status:{" "}
              {status?.linked ? (
                <span className="text-green-600 font-medium">Connected</span>
              ) : (
                <span className="text-muted-foreground">Not connected</span>
              )}
            </p>

            {status?.linked ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  className="gap-2"
                  onClick={() => window.open(status.botUrl, "_blank", "noopener,noreferrer")}
                >
                  <ExternalLink className="h-4 w-4" />
                  Open chatbot
                </Button>
                <Button variant="outline" onClick={disconnect} disabled={linking}>
                  Disconnect
                </Button>
              </div>
            ) : (
              <>
                <Button onClick={enableTelegram} disabled={linking} className="gap-2">
                  <Send className="h-4 w-4" />
                  {linking ? "Creating link\u2026" : "Enable Telegram"}
                </Button>

                {status?.link && (
                  <div className="text-sm space-y-3 rounded-lg bg-muted p-3">
                    <p>
                      Tap Start in Telegram to finish linking. This link expires in 15 minutes and works once.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        className="gap-2"
                        onClick={() => window.open(status.link!, "_blank", "noopener,noreferrer")}
                      >
                        <ExternalLink className="h-4 w-4" />
                        Open chatbot
                      </Button>
                      <Button type="button" size="sm" variant="outline" className="gap-2" onClick={copyLink}>
                        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        {copied ? "Copied" : "Copy link"}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground break-all">{status.link}</p>
                  </div>
                )}
              </>
            )}
            {tgError && <Alert>{tgError}</Alert>}
          </CardContent>
        </Card>
      )}
      </div>
    </PageShell>
  );
}
