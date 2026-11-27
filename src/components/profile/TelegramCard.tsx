"use client";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AccordionSection } from "@/components/ui/accordion";
import { Check, Copy, ExternalLink, Send } from "lucide-react";
import { TelegramPrefs } from "@/components/profile/TelegramPrefs";
import { useTelegramLink } from "@/components/profile/use-telegram-link";
import Link from "next/link";
import { FEATURE_LABEL, featureLocked, type ProFeature } from "@/lib/limits";
import { useLimits } from "@/lib/use-limits";
import { todayISO } from "@/lib/utils";

export function TelegramCard() {
  const { featureOn, status, linking, copied, error: tgError, enable: enableTelegram, copyLink, disconnect } = useTelegramLink();
  const lim = useLimits();
  const proOnly = (["telegram_save", "telegram_summary", "doc_reminders"] as ProFeature[]).filter((f) => !!lim && featureLocked(lim.limits, lim.who, f, todayISO()));

  if (!featureOn) return null;

  return (
      <AccordionSection
        id="telegram"
        title="Telegram"
        icon={<Send />} tone="telegram"
        summary={status?.linked ? "Send receipts and documents from your phone" : "Not connected"}
        badge={status?.linked ? { text: "Connected", tone: "good" } : null}
        description="Enable it to send receipts and documents from Telegram: business trips, groceries, projects, personal travel and documents"
      >
        <div className="space-y-3">
          {proOnly.length > 0 && (
            <div className="rounded-xl border p-3 text-sm" data-testid="telegram-pro-only">
              <p className="font-semibold">Trip reminders are free for everyone.</p>
              <ul className="mt-2 divide-y">
                {proOnly.map((f) => (<li key={f} className="flex items-center justify-between gap-3 py-2"><span>{FEATURE_LABEL[f]}</span><span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-extrabold text-amber-800 dark:bg-amber-950 dark:text-amber-200">Pro</span></li>))}
              </ul>
              <Link href="/personal/pro" className="mt-2 inline-flex min-h-11 items-center text-sm font-bold text-primary underline">Get Pro</Link>
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
        </div>
      </AccordionSection>
  );
}
