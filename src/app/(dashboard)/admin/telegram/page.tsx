"use client";

import { useEffect, useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function AdminTelegramPage() {
  const [enabled, setEnabled] = useState(false);
  const [botUsername, setBotUsername] = useState("");
  const [botToken, setBotToken] = useState("");
  const [tokenConfigured, setTokenConfigured] = useState(false);
  const [tokenPreview, setTokenPreview] = useState<string | null>(null);
  const [secretConfigured, setSecretConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/telegram")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setEnabled(!!data.enabled);
        setBotUsername(data.botUsername || "");
        setTokenConfigured(!!data.tokenConfigured);
        setTokenPreview(data.tokenPreview || null);
        setSecretConfigured(!!data.secretConfigured);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Could not load settings");
      })
      .finally(() => setLoading(false));
  }, []);

  const save = async (setHook: boolean) => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, botUsername, botToken, setWebhook: setHook }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setBotUsername(data.botUsername || botUsername);
      setTokenConfigured(true);
      setTokenPreview(data.tokenPreview || null);
      setSecretConfigured(true);
      setBotToken("");
      setMessage(
        data.webhook
          ? `Saved. Webhook set to ${data.webhook}`
          : "Saved. Token verified with Telegram."
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
          <Send className="h-7 w-7" />
          Telegram
        </h1>
        <p className="text-muted-foreground mt-1">
          Connect the bot here. Nothing needs to be set in Vercel.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Bot setup</CardTitle>
          <CardDescription>
            Paste the token from @BotFather. It is stored on the server and is never shown again.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <>
              <label className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  className="h-4 w-4"
                />
                Telegram receipt uploads enabled
              </label>

              <div className="space-y-2">
                <label className="text-sm font-medium">Bot token</label>
                <Input
                  type="password"
                  value={botToken}
                  onChange={(e) => setBotToken(e.target.value)}
                  placeholder={tokenConfigured ? "Leave blank to keep the saved token" : "123456:ABC..."}
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">
                  {tokenConfigured
                    ? `Saved token: ${tokenPreview}`
                    : "No token saved yet."}
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Bot username</label>
                <Input
                  value={botUsername}
                  onChange={(e) => setBotUsername(e.target.value)}
                  placeholder="Filled automatically when you save"
                />
                <p className="text-xs text-muted-foreground">
                  Without the @. Used in the user link t.me/username?start=CODE
                </p>
              </div>

              <p className="text-xs text-muted-foreground">
                Webhook secret: {secretConfigured ? "configured" : "created on first save"}
              </p>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 p-3 rounded-md">{error}</p>
              )}
              {message && (
                <p className="text-sm text-green-600 bg-green-50 p-3 rounded-md">{message}</p>
              )}

              <div className="flex flex-wrap gap-2">
                <Button disabled={saving} onClick={() => save(false)}>
                  {saving ? "Saving\u2026" : "Save and verify"}
                </Button>
                <Button
                  variant="outline"
                  disabled={saving}
                  onClick={() => save(true)}
                >
                  Save and set webhook
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>How this is set up</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>1. Create the bot with @BotFather and copy the token.</p>
          <p>2. Paste it here. The server checks it with Telegram before saving.</p>
          <p>3. Click Save and set webhook so Telegram can deliver messages.</p>
          <p>4. Users open Settings, enable Telegram, and get a one-time bot link.</p>
          <p>The token is not stored in the repo or shown in the browser after save.</p>
        </CardContent>
      </Card>
    </div>
  );
}
