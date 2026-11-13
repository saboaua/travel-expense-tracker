"use client";

import { Select } from "@/components/ui/select";
import { AWG_PER_USD } from "@/lib/personal/dashboard";
import { formatCurrency } from "@/lib/utils";

type Props = {
  id: string;
  amount: string;
  onAmount: (v: string) => void;
  currency: string;
  onCurrency: (c: string) => void;
  /** The one-tap currencies (AWG and USD), when both exist */
  choices: string[];
  /** Every other currency the account can use */
  others: { code: string }[];
  /** Rate to USD, only asked for currencies that have no fixed rate */
  rate: string;
  onRate: (v: string) => void;
};

/**
 * Amount with ONE currency control: AWG and USD as buttons, any other currency from a dropdown inside the same box.
 * AWG is pegged, so nothing is asked for it; USD shows what it comes to in AWG; any other currency asks for its rate.
 */
export function AmountField({ id, amount, onAmount, currency, onCurrency, choices, others, rate, onRate }: Props) {
  const typed = Number(amount.replace(",", "."));
  const showOther = others.length > 0 || choices.length === 0;
  const otherValue = choices.includes(currency) ? "" : currency;
  return (
    <div>
      <div className="flex items-center gap-2 rounded-xl border bg-background px-3">
        <input id={id} inputMode="decimal" autoComplete="off" value={amount} onChange={(e) => onAmount(e.target.value)} placeholder="0.00" className="h-14 min-w-0 flex-1 bg-transparent text-2xl font-bold tabular-nums outline-none" />
        {choices.length > 0 && (
          <div className="flex overflow-hidden rounded-lg border" role="group" aria-label="Currency">
            {choices.map((c) => <button key={c} type="button" aria-pressed={currency === c} onClick={() => onCurrency(c)} className={`min-h-11 px-3 text-sm font-semibold ${currency === c ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : ""}`}>{c}</button>)}
          </div>
        )}
        {showOther && (
          <Select value={otherValue} onChange={(e) => e.target.value && onCurrency(e.target.value)} aria-label={choices.length > 0 ? "Another currency" : "Currency"} className="h-11 w-auto min-w-[4.5rem] shrink-0">
            {choices.length > 0 && <option value="">Other</option>}
            {others.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
          </Select>
        )}
      </div>
      {currency === "USD" && typed > 0 && (
        <p className="mt-1.5 text-xs text-muted-foreground" data-testid="amount-in-awg"><b className="text-foreground">= {formatCurrency(Math.round(typed * AWG_PER_USD * 100) / 100, "AWG")}</b> at 1 USD = {AWG_PER_USD} AWG</p>
      )}
      {currency !== "USD" && currency !== "AWG" && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          Rate to USD <input aria-label="Exchange rate to USD" value={rate} onChange={(e) => onRate(e.target.value)} inputMode="decimal" className="ml-1 min-h-9 w-24 rounded border bg-background px-1.5 py-0.5 tabular-nums" />
        </p>
      )}
    </div>
  );
}
