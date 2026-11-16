/** Pro paid by bank transfer: the admin sets prices and accounts, a user asks with a reference, the admin confirms when the money is in. */
import { defaultEndsOn, isIsoDate, type PlanPeriod } from "@/lib/plans";

export type PayPeriod = "monthly" | "yearly";
export type PayMethod = "aruba_bank" | "cmb" | "cash" | "other" | "bitcoin";
export type PayStatus = "pending" | "confirmed" | "rejected" | "expired";
export type BankAccount = { bank: string; name: string; number: string; currency: string };
export type PaymentSettings = { currency: string; monthly_price: number; yearly_price: number; accounts: BankAccount[]; instructions: string; btc_enabled: boolean; btc_quote_minutes: number; btc_confirmations: number };
export type PlanPayment = { id: string; user_id: string; period: PayPeriod; amount: number; currency: string; method: PayMethod; reference: string; note: string | null; status: PayStatus; paid_on: string | null; created_at: string; btc_address?: string | null; btc_amount?: number | null; btc_rate_usd?: number | null; expires_at?: string | null; txid?: string | null; claimed_at?: string | null };

export const PAYMENT_BASE_SETTINGS_COLS = "currency, monthly_price, yearly_price, accounts, instructions";
export const PAYMENT_SETTINGS_COLS = PAYMENT_BASE_SETTINGS_COLS + ", btc_enabled, btc_quote_minutes, btc_confirmations";
export const PAYMENT_BASE_COLS = "id, user_id, period, amount, currency, method, reference, note, status, paid_on, created_at";
export const PAYMENT_COLS = PAYMENT_BASE_COLS + ", btc_address, btc_amount, btc_rate_usd, expires_at, txid, claimed_at";
export const METHOD_LABEL: Record<PayMethod, string> = { aruba_bank: "Aruba Bank", cmb: "CMB", cash: "Cash", other: "Other", bitcoin: "Bitcoin" };
export const isMethod = (v: unknown): v is PayMethod => v === "aruba_bank" || v === "cmb" || v === "cash" || v === "other" || v === "bitcoin";
export const isPayPeriod = (v: unknown): v is PayPeriod => v === "monthly" || v === "yearly";

export const EMPTY_SETTINGS: PaymentSettings = { currency: "AWG", monthly_price: 0, yearly_price: 0, accounts: [], instructions: "", btc_enabled: false, btc_quote_minutes: 30, btc_confirmations: 2 };

/** A short code the person puts in the bank description, the same every time for the same account. */
export function userReference(userId: string): string {
  return "LIF-" + userId.replace(/-/g, "").slice(0, 5).toUpperCase();
}

export function priceFor(s: Pick<PaymentSettings, "monthly_price" | "yearly_price">, period: PayPeriod): number {
  return period === "yearly" ? s.yearly_price : s.monthly_price;
}

/** The plans people can pick: a plan with no price is not offered. */
export function offeredPeriods(s: Pick<PaymentSettings, "monthly_price" | "yearly_price">): PayPeriod[] {
  return (["monthly", "yearly"] as PayPeriod[]).filter((p) => priceFor(s, p) > 0);
}

/** Whole months free when paying yearly, shown as "2 months free". */
export function monthsFree(s: Pick<PaymentSettings, "monthly_price" | "yearly_price">): number {
  if (!(s.monthly_price > 0) || !(s.yearly_price > 0)) return 0;
  return Math.max(0, Math.floor((s.monthly_price * 12 - s.yearly_price) / s.monthly_price + 1e-9));
}

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const price = (v: unknown) => { const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) && n >= 0 && n < 100000 ? Math.round(n * 100) / 100 : null; };

const whole = (v: unknown, min: number, max: number) => { if (v == null || v === "") return null; const n = Number(v); return Number.isInteger(n) && n >= min && n <= max ? n : null; };

/** Read admin input. Returns the settings to save, or the sentence that says what to fix. */
export function parseSettings(body: Record<string, unknown>): { ok: true; value: PaymentSettings } | { ok: false; error: string } {
  const monthly = price(body.monthly_price), yearly = price(body.yearly_price);
  if (monthly == null || yearly == null) return { ok: false, error: "Enter the monthly and yearly price as numbers." };
  const raw = Array.isArray(body.accounts) ? body.accounts : [];
  if (raw.length > 6) return { ok: false, error: "Add at most 6 bank accounts." };
  const accounts: BankAccount[] = [];
  for (const a of raw as Record<string, unknown>[]) {
    const bank = clean(a?.bank, 60), number = clean(a?.number, 60);
    if (!bank && !number) continue;
    if (!bank || !number) return { ok: false, error: "Each bank account needs a bank name and an account number." };
    accounts.push({ bank, name: clean(a.name, 80), number, currency: clean(a.currency, 3).toUpperCase() || "AWG" });
  }
  const minutes = body.btc_quote_minutes === undefined ? 30 : whole(body.btc_quote_minutes, 5, 120), confirmations = body.btc_confirmations === undefined ? 2 : whole(body.btc_confirmations, 0, 12);
  if (minutes == null) return { ok: false, error: "Price valid time must be between 5 and 120 minutes." };
  if (confirmations == null) return { ok: false, error: "Confirmations must be between 0 and 12." };
  return { ok: true, value: { currency: clean(body.currency, 3).toUpperCase() || "AWG", monthly_price: monthly, yearly_price: yearly, accounts, instructions: clean(body.instructions, 600), btc_enabled: body.btc_enabled === true, btc_quote_minutes: minutes, btc_confirmations: confirmations } };
}

/** The new end date. Paying again before Pro ends adds the time to the end date instead of losing the days left. */
export function renewedEndsOn(period: PlanPeriod, today: string, currentEndsOn: string | null | undefined): string | null {
  const base = currentEndsOn && isIsoDate(currentEndsOn) && currentEndsOn > today ? currentEndsOn : today;
  return defaultEndsOn(period, base);
}

/** Admin input for a payment received when adding a plan by hand. */
export function parseReceived(v: unknown, fallbackCurrency: string): { ok: true; value: { amount: number; paid_on: string; method: PayMethod; reference: string; note: string | null } } | { ok: false; error: string } {
  const b = (v ?? {}) as Record<string, unknown>;
  const amount = price(b.amount);
  if (amount == null || amount <= 0) return { ok: false, error: "Enter the amount you received." };
  if (!isIsoDate(b.paid_on)) return { ok: false, error: "Choose the date you received it." };
  const method = isMethod(b.method) ? b.method : "other";
  void fallbackCurrency;
  return { ok: true, value: { amount, paid_on: b.paid_on as string, method, reference: clean(b.reference, 40), note: clean(b.note, 300) || null } };
}
