"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "pwa-install-dismissed";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  // Android / desktop installed
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  // iOS installed
  if ((navigator as Navigator & { standalone?: boolean }).standalone === true) return true;
  return false;
}

function isMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) && !(window as any).MSStream;
}

export function InstallPrompt() {
  const [show, setShow] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    // Already added to home screen — never show
    if (isStandalone()) return;
    // Only on phones
    if (!isMobile()) return;
    // User previously dismissed
    if (localStorage.getItem(DISMISS_KEY) === "1") return;

    setIos(isIos());

    // Register service worker (needed for installability on Chromium)
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setShow(true);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    // iOS has no beforeinstallprompt — show manual instructions
    if (isIos()) {
      setShow(true);
    }

    // If already installed, hide
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
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    if (outcome === "accepted") {
      setShow(false);
    }
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md rounded-xl border bg-card shadow-lg p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Download className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="font-medium text-sm">Add to Home Screen</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {ios
                ? "Tap the Share button, then \u201cAdd to Home Screen\u201d."
                : "Install the app for quick access and a full-screen experience."}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="p-1 rounded-md text-muted-foreground hover:bg-accent"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {!ios && deferred && (
        <Button size="sm" onClick={install} className="w-full">
          Add to Home Screen
        </Button>
      )}
    </div>
  );
}
