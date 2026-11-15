import { Check, CircleAlert, Clock, Container, Droplet, Mail, Paperclip, Phone, Receipt, Trash2, Wifi, Zap, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconTile } from "@/components/ui/icon-tile";
import { toneStyle, type IconTone } from "@/lib/icon-tones";
import { monthShort, type BillRow } from "@/lib/personal/utilities";

const KINDS: Record<string, { icon: LucideIcon; tone: IconTone }> = {
  water: { icon: Droplet, tone: "water" },
  electricity: { icon: Zap, tone: "electricity" },
  phone: { icon: Phone, tone: "phone" },
  internet: { icon: Wifi, tone: "internet" },
  septic: { icon: Container, tone: "septic" },
  trash: { icon: Trash2, tone: "trash" },
};
export const kindMeta = (kind: string) => KINDS[kind] ?? { icon: Receipt, tone: "otherBill" as IconTone };

/** A utility's own icon and color: the same on the list, the history and the bars. */
export function UtilityIcon({ kind, className = "h-11 w-11" }: { kind: string; className?: string }) {
  const { icon: Icon, tone } = kindMeta(kind);
  return <IconTile tone={tone} className={className}><Icon className="h-[22px] w-[22px]" /></IconTile>;
}

const CHIP = "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-bold";
/** Every state is a word and an icon, never color alone. */
export function PaidChip() { return <span className={cn(CHIP, "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200")}><Check className="h-3 w-3" aria-hidden="true" />Paid</span>; }
export function LateChip({ text }: { text: string }) { return <span data-testid="util-late" className={cn(CHIP, "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200")}><CircleAlert className="h-3 w-3" aria-hidden="true" />{text}</span>; }
export function SoonChip({ text }: { text: string }) { return <span className={cn(CHIP, "bg-muted text-muted-foreground")}><Clock className="h-3 w-3" aria-hidden="true" />{text}</span>; }
export function MissingChip() { return <span className={cn(CHIP, "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200")}><CircleAlert className="h-3 w-3" aria-hidden="true" />Amount missing</span>; }
export function EmailChip() { return <span data-testid="util-from-email" className={cn(CHIP, "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200")}><Mail className="h-3 w-3" aria-hidden="true" />From email</span>; }
export function RefChip({ value }: { value: string }) { return <span data-testid="util-ref" className={cn(CHIP, "max-w-full bg-muted text-foreground/80")}><Paperclip className="h-3 w-3 shrink-0" aria-hidden="true" /><span className="truncate">Ref {value}</span></span>; }

/** The last months as bars, this month in the strong color. Amounts are said for screen readers. */
export function TrendBars({ data, fmt }: { data: { month: string; usd: number }[]; fmt: (usd: number) => string }) {
  const max = Math.max(...data.map((d) => d.usd), 1);
  return (
    <div className="flex h-[68px] items-end gap-2" role="img" aria-label={`Paid each month: ${data.map((d) => `${monthShort(d.month)} ${fmt(d.usd)}`).join(", ")}`} data-testid="util-trend">
      {data.map((d, i) => {
        const now = i === data.length - 1;
        return (
          <div key={d.month} className="flex flex-1 flex-col items-center gap-1" aria-hidden="true">
            <div className={cn("w-full max-w-[34px] rounded-md", now ? "bg-primary" : "bg-primary/20")} style={{ height: `${Math.max(6, Math.round((d.usd / max) * 44))}px` }} />
            <span className={cn("text-[11px]", now ? "font-bold text-primary" : "text-muted-foreground")}>{monthShort(d.month)}</span>
          </div>
        );
      })}
    </div>
  );
}

/** One bar split by utility, with a legend that says each share in words. */
export function SplitBar({ parts, label }: { parts: { kind: string; pct: number }[]; label: (kind: string) => string }) {
  return (
    <div data-testid="util-split">
      <div className="flex h-3 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        {parts.map((p) => <span key={p.kind} className="tone-bg block h-full" style={{ ...toneStyle(kindMeta(p.kind).tone), width: `${p.pct}%` }} />)}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {parts.map((p) => (
          <li key={p.kind} className="flex items-center gap-1.5 text-[12.5px]">
            <span className="tone-bg h-2.5 w-2.5 rounded" style={toneStyle(kindMeta(p.kind).tone)} aria-hidden="true" />
            <span className="font-semibold">{label(p.kind)}</span><span className="text-muted-foreground">{p.pct}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export type { BillRow };
