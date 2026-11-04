"use client";

import { useEffect, useRef } from "react";

type TurnstileApi = { render: (el: HTMLElement, o: Record<string, unknown>) => string; remove: (id: string) => void };
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SRC}"]`);
    const s = existing || document.createElement("script");
    s.addEventListener("load", () => resolve());
    s.addEventListener("error", () => reject(new Error("captcha script failed")));
    if (!existing) {
      s.src = SRC;
      s.async = true;
      document.head.appendChild(s);
    }
  });
}

export function Turnstile({ siteKey, onToken, onError }: { siteKey: string; onToken: (t: string | null) => void; onError?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let id: string | null = null;
    let gone = false;
    loadScript()
      .then(() => {
        if (gone || !ref.current || !window.turnstile) return;
        id = window.turnstile.render(ref.current, {
          sitekey: siteKey,
          callback: (t: string) => onToken(t),
          "expired-callback": () => onToken(null),
          "error-callback": () => {
            onToken(null);
            onError?.();
          },
        });
      })
      .catch(() => onError?.());
    return () => {
      gone = true;
      if (id && window.turnstile) window.turnstile.remove(id);
    };
  }, [siteKey, onToken, onError]);
  return <div ref={ref} className="flex justify-center" />;
}
