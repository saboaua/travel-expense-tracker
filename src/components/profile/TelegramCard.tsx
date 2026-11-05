"use client";

import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, Copy, ExternalLink, Send } from "lucide-react";
import { TelegramPrefs } from "@/components/profile/TelegramPrefs";

type TelegramStatus = {
  linked: boolean;
  bot: string;
  botUrl: string;
  code: string | null;
  expires: string | null;
  link: string | null;
};

export function TelegramCard() {
  const [featureOn, setFeatureOn] = useState(false);
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [linking, setLinking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tgError, setTgError] = useState<string | null>(null);

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
    loadTelegram();
  }, []);

  useEffect(() => {
    if (!status?.link || status.linked) return;
    const id = setInterval(loadTelegram, 4000);
    return () => clearInterval(id);
  }, [status?.link, status?.linked]);

  const enableTelegram = async () => {
    setLinking(true);
    setTgError(null);
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
      setTgError(err instanceof Error ? err.message : "Could not create link");
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

  if (!featureOn) return null;

  return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Telegram
          </CardTitle>
          <CardDescription>
            Enable it to send receipts and documents from Telegram: business trips, groceries, home projects, personal travel and documents
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

          {status?.linked && <TelegramPrefs />}

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

          {tgError && (
            <Alert>{tgError}</Alert>
          )}
        </CardContent>
      </Card>
  );
}
