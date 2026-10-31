"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Send } from "lucide-react";

export default function SettingsPage() {
  const supabase = createClient();
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [telegramEnabled, setTelegramEnabled] = useState(false);
  const [telegramLinked, setTelegramLinked] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    async function loadProfile() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("profiles")
        .select("full_name, company_name, telegram_id")
        .eq("id", user.id)
        .single();

      if (data) {
        setFullName(data.full_name || "");
        setCompanyName(data.company_name || "");
        setTelegramLinked(!!data.telegram_id);
      }

      const { data: settings } = await supabase
        .from("app_settings")
        .select("telegram_enabled")
        .eq("id", 1)
        .single();
      setTelegramEnabled(!!settings?.telegram_enabled);
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

    if (error) {
      setError(error.message);
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
    setLoading(false);
  };

  const connectTelegram = async () => {
    setLinking(true);
    setError(null);
    try {
      const res = await fetch("/api/telegram/link", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create link");
      setCode(data.code);
      setLink(data.link);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not create link");
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

      {telegramEnabled && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              Telegram
            </CardTitle>
            <CardDescription>
              Upload receipts by messaging the bot — no need to open the app
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm">
              Status: {telegramLinked ? "Linked" : "Not linked"}
            </p>
            <Button type="button" variant="outline" onClick={connectTelegram} disabled={linking}>
              {linking ? "Creating code…" : telegramLinked ? "Relink Telegram" : "Connect Telegram"}
            </Button>
            {code && link && (
              <div className="text-sm space-y-2 rounded-md bg-muted p-3">
                <p>Code (15 min): <span className="font-mono font-semibold">{code}</span></p>
                <a href={link} className="text-primary underline break-all" target="_blank" rel="noreferrer">
                  Open bot and link
                </a>
                <p className="text-muted-foreground">
                  Or open the bot and send <span className="font-mono">/start {code}</span>
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
