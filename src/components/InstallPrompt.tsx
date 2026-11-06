"use client";

import { useEffect, useState } from "react";
import { Download, X, Share } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "pwa-install-dismissed";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  if ((navigator as Navigator & { standalone?: boolean }).standalone === true) return true;
  return false;
}

function isMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function InstallPrompt() {
  const [show, setShow] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    if (isStandalone()) return;
    if (!isMobile()) return;
    if (localStorage.getItem(DISMISS_KEY) === "1") return;

    const iosDevice = isIos();
    setIos(iosDevice);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setShow(true);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    // Show banner even if the browser never fires beforeinstallprompt
    setShow(true);

    const onInstalled = () => {
      setShow(false);
      setDeferred(null);
    };
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setShow(false);
  };

  const install = async () => {
    setHint(null);

    if (ios) {
      setHint("Tap the Share button (square with arrow) at the bottom of Safari, then tap \u201cAdd to Home Screen\u201d.");
      return;
    }

    if (deferred) {
      try {
        await deferred.prompt();
        const { outcome } = await deferred.userChoice;
        setDeferred(null);
        if (outcome === "accepted") setShow(false);
      } catch {
        setHint("Open the browser menu (\u22ee or \u22ef) and choose \u201cInstall app\u201d or \u201cAdd to Home screen\u201d.");
      }
      return;
    }

    // No native prompt available (common until SW is ready, or on some browsers)
    setHint("Open the browser menu (\u22ee or \u22ef) and choose \u201cInstall app\u201d or \u201cAdd to Home screen\u201d.");
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-4 right-4 z-50 mx-auto max-w-md md:bottom-4 rounded-xl border bg-card shadow-lg p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            {ios ? <Share className="h-5 w-5 text-primary" /> : <Download className="h-5 w-5 text-primary" />}
          </div>
          <div>
            <p className="font-medium text-sm">Add to Home Screen</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {hint ||
                (ios
                  ? "Tap below for steps, or use the Share button."
                  : "Install the app for quick access and a full-screen experience.")}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="p-1 rounded-lg text-muted-foreground hover:bg-accent"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <Button size="sm" onClick={install} className="w-full">
        {ios ? "How to add" : deferred ? "Add to Home Screen" : "Add to Home Screen"}
      </Button>
    </div>
  );
}
