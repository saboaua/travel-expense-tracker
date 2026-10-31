"use client";

import { useEffect, useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function AdminTelegramPage() {
  const [enabled, setEnabled] = useState(false);
  const [botUsername, setBotUsername] = useState("travelexpenseassistant_bot");
  const [tokenConfigured, setTokenConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/telegram")
      .then((r) => r.json())
      .then((data) => {
        setEnabled(!!data.enabled);
        setBotUsername(data.botUsername || "travelexpenseassistant_bot");
        setTokenConfigured(!!data.tokenConfigured);
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
        body: JSON.stringify({ enabled, botUsername, setWebhook: setHook }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setMessage(
        data.webhook
          ? `Saved. Webhook set to ${data.webhook}`
          : "Saved."
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
          Let users upload receipts by messaging the bot
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Enable bot</CardTitle>
          <CardDescription>
            Bot: @{botUsername}. Token is read from the server environment
            (TELEGRAM_BOT_TOKEN), never from the browser.
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
                <label className="text-sm font-medium">Bot username</label>
                <Input
                  value={botUsername}
                  onChange={(e) => setBotUsername(e.target.value)}
                  placeholder="travelexpenseassistant_bot"
                />
              </div>

              <p className="text-xs text-muted-foreground">
                Token configured: {tokenConfigured ? "yes" : "no — set TELEGRAM_BOT_TOKEN in hosting env"}
              </p>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 p-3 rounded-md">{error}</p>
              )}
              {message && (
                <p className="text-sm text-green-600 bg-green-50 p-3 rounded-md">{message}</p>
              )}

              <div className="flex flex-wrap gap-2">
                <Button disabled={saving} onClick={() => save(false)}>
                  {saving ? "Saving…" : "Save"}
                </Button>
                <Button
                  variant="outline"
                  disabled={saving || !enabled}
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
          <CardTitle>How users use it</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>1. Admin enables Telegram here and sets the webhook.</p>
          <p>2. User opens Settings → Connect Telegram and gets a code.</p>
          <p>3. User opens the bot and sends that code (or the link).</p>
          <p>4. User sends a receipt photo or PDF. It is stored on their active trip and OCR-filled.</p>
        </CardContent>
      </Card>
    </div>
  );
}
