"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, Copy, ExternalLink, Send } from "lucide-react";

type TelegramStatus = {
  linked: boolean;
  bot: string;
  botUrl: string;
  code: string | null;
  expires: string | null;
  link: string | null;
};

export default function SettingsPage() {
  const supabase = createClient();
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [featureOn, setFeatureOn] = useState(false);
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [linking, setLinking] = useState(false);
  const [copied, setCopied] = useState(false);

  async function loadTelegram() {
    const res = await fetch("/api/telegram/link");
    if (!res.ok) {
      setFeatureOn(false);
      return;
    }
    setFeatureOn(true);
    setStatus(await res.json());
  }

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
    loadTelegram();
  }, [supabase]);

  useEffect(() => {
    if (!status?.link || status.linked) return;
    const id = setInterval(loadTelegram, 4000);
    return () => clearInterval(id);
  }, [status?.link, status?.linked]);

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

  const enableTelegram = async () => {
    setLinking(true);
    setError(null);
    try {
      const res = await fetch("/api/telegram/link", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create link");
      setStatus((prev) => ({
        linked: prev?.linked || false,
        bot: data.bot,
        botUrl: `https://t.me/${data.bot}`,
        code: data.code,
        expires: data.expires,
        link: data.link,
      }));
      window.open(data.link, "_blank", "noopener,noreferrer");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not create link");
    } finally {
      setLinking(false);
    }
  };

  const copyLink = async () => {
    if (!status?.link) return;
    await navigator.clipboard.writeText(status.link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const disconnect = async () => {
    setLinking(true);
    try {
      await fetch("/api/telegram/link", { method: "DELETE" });
      await loadTelegram();
    } finally {
      setLinking(false);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Profile and Telegram receipt upload
        </p>
      </div>

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
              <p className="text-sm text-red-600 bg-red-50 p-3 rounded-md">{error}</p>
            )}
            {saved && (
              <p className="text-sm text-green-600 bg-green-50 p-3 rounded-md">
                Settings saved successfully
              </p>
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
                  <div className="text-sm space-y-3 rounded-md bg-muted p-3">
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
          </CardContent>
        </Card>
      )}
    </div>
  );
}
