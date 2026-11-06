"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";

type ConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button, for deletes. */
  destructive?: boolean;
  /** Only an OK button: for telling the person something went wrong. */
  hideCancel?: boolean;
};

type Confirm = (options: ConfirmOptions | string) => Promise<boolean>;
const ConfirmContext = React.createContext<Confirm | null>(null);

/** Replaces window.confirm: `if (!(await confirm("Delete this?"))) return;` */
export function useConfirm(): Confirm {
  const ctx = React.useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used inside <ConfirmProvider>");
  return ctx;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<{ options: ConfirmOptions; resolve: (v: boolean) => void } | null>(null);
  const confirmRef = React.useRef<HTMLButtonElement>(null);
  const previousFocus = React.useRef<HTMLElement | null>(null);

  const confirm = React.useCallback<Confirm>((options) => {
    previousFocus.current = document.activeElement as HTMLElement | null;
    const o = typeof options === "string" ? { message: options } : options;
    return new Promise<boolean>((resolve) => setState({ options: o, resolve }));
  }, []);

  const close = (answer: boolean) => {
    state?.resolve(answer);
    setState(null);
    previousFocus.current?.focus?.();
  };

  React.useEffect(() => {
    if (!state) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        state.resolve(false);
        setState(null);
        previousFocus.current?.focus?.();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [state]);

  const o = state?.options;
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {o && (
        <div className="app-frame fixed inset-0 z-[100] flex items-end justify-center bg-black/40 p-4 sm:items-center" onMouseDown={(e) => e.target === e.currentTarget && close(false)}>
          <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message" className="w-full max-w-sm rounded-xl border bg-background p-5 shadow-xl">
            <h2 id="confirm-title" className="text-base font-semibold">{o.title ?? (o.destructive ? "Are you sure?" : "Please confirm")}</h2>
            <p id="confirm-message" className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{o.message}</p>
            <div className="mt-5 flex justify-end gap-2">
              {!o.hideCancel && <Button type="button" variant="outline" onClick={() => close(false)}>{o.cancelLabel ?? "Cancel"}</Button>}
              <Button ref={confirmRef} type="button" variant={o.destructive ? "destructive" : "default"} onClick={() => close(true)}>
                {o.confirmLabel ?? (o.destructive ? "Delete" : "Confirm")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
