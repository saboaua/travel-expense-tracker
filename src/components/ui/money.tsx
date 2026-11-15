import { cn, formatCurrency } from "@/lib/utils";

/**
 * Every amount that stands on its own (a list row, a total, a tile, a receipt line) is shown the same way:
 * the currency small and muted, the number large and bold. The size follows the text around it, so a row,
 * a card total and a hero figure all use this one piece. An amount inside a sentence stays plain text.
 * The text is exactly what formatCurrency gives, so copying it, searching for it and screen readers all still work.
 */
export function Money({ amount, currency, className, over = false }: { amount: number; currency: string; className?: string; over?: boolean }) {
  const full = formatCurrency(Number.isFinite(amount) ? amount : 0, currency);
  const m = /^(-)?\s*(\D*?)(\s*)([\d,]+(?:\.\d+)?)$/.exec(full);
  if (!m) return <span className={cn("whitespace-nowrap font-extrabold tabular-nums", className)}>{full}</span>;
  const [, sign = "", symbol, gap, digits] = m;
  return (
    <span className={cn("whitespace-nowrap tabular-nums", over && "text-red-700 dark:text-red-300", className)}>
      {symbol && <span className="text-[0.62em] font-bold tracking-wider opacity-65">{symbol}{gap}</span>}
      <span className="font-extrabold tracking-tight">{sign}{digits}</span>
    </span>
  );
}
