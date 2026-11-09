import { cn } from "@/lib/utils";

/** An on/off switch with a 44px tap area. `locked` shows it on and not changeable. */
export function Switch({ checked, onChange, label, disabled, locked }: { checked: boolean; onChange?: (v: boolean) => void; label: string; disabled?: boolean; locked?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-disabled={locked || undefined}
      disabled={disabled}
      onClick={() => { if (!locked) onChange?.(!checked); }}
      className="flex h-11 w-14 shrink-0 items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
    >
      <span className={cn("flex h-8 w-[52px] items-center rounded-full p-[3px] transition-colors", checked ? (locked ? "justify-end bg-primary/50" : "justify-end bg-primary") : "justify-start bg-muted-foreground/30")}>
        <span className="h-[26px] w-[26px] rounded-full bg-white shadow" />
      </span>
    </button>
  );
}
