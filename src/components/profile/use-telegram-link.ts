"use client";

import { useCallback, useEffect, useState } from "react";

export type TelegramStatus = {
  linked: boolean;
  bot: string;
  botUrl: string;
  code: string | null;
  expires: string | null;
  link: string | null;
};

/** Linking a Telegram chat: whether the feature is on, the link state, and enable / copy / disconnect. Used by Profile and Settings. */
export function useTelegramLink() {
  const [featureOn, setFeatureOn] = useState(false);
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [linking, setLinking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/telegram/link");
    const data = res.ok ? await res.json() : null;
    if (!data || data.enabled === false) {
      setFeatureOn(false);
      return;
    }
    setFeatureOn(true);
    setStatus(data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // While a link is waiting to be used, check every few seconds whether the person has tapped Start
  useEffect(() => {
    if (!status?.link || status.linked) return;
    const id = setInterval(() => void load(), 4000);
    return () => clearInterval(id);
  }, [status?.link, status?.linked, load]);

  const enable = async () => {
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
      await load();
    } finally {
      setLinking(false);
    }
  };

  return { featureOn, status, linking, copied, error, enable, copyLink, disconnect };
}
