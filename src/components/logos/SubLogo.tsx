import { cn } from "@/lib/utils";

/** The tile before a subscription: its logo, or the first letter of its name when it has none. */
export function SubLogo({ logo, name, tone = "muted", className }: { logo?: string | null; name: string; tone?: "muted" | "primary"; className?: string }) {
  const base = "flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl";
  if (logo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <span className={cn(base, "bg-white ring-1 ring-black/5", className)}><img src={logo} alt="" className="h-full w-full object-contain" data-testid="sub-logo" /></span>;
  }
  return <span className={cn(base, "font-bold", tone === "primary" ? "bg-primary/10 text-primary" : "bg-muted", className)}>{name.slice(0, 1).toUpperCase()}</span>;
}
