/**
 * A receipt checks itself: quantity x unit price = line total, the lines add up to the subtotal, and
 * subtotal + tax = total. These checks decide whether a reading can be trusted, which rows to flag, and
 * whether the AI should look at the photo again. Two independent readers (AI and on-device OCR) are also
 * compared, price by price: where both print the same figure it is almost certainly right.
 */
import { moneyTokens } from "@/lib/ocr-clean";
import type { GroceryLine } from "@/lib/personal/grocery";

const r2 = (n: number) => Math.round(n * 100) / 100;

export type ScanCheck = {
  /** True when nothing needs a second look. */
  ok: boolean;
  itemsSum: number;
  /** Items sum minus what it should be (subtotal, or total less tax, or total); null when the receipt total is unknown. */
  diff: number | null;
  /** Plain sentences for the person, worst first. */
  issues: string[];
  /** Row index -> why that row is flagged. */
  flagged: Record<number, string>;
  /** Lower is better; used to compare two readings of the same receipt. */
  score: number;
};

type Checkable = { items: GroceryLine[]; total: number | null; subtotal?: number | null; tax?: number | null };

export function checkGrocery(scan: Checkable): ScanCheck {
  const flagged: Record<number, string> = {};
  const issues: string[] = [];
  let score = 0;

  scan.items.forEach((it, i) => {
    const expected = r2(it.quantity * it.unit_price);
    if (Math.abs(expected - it.line_total) > Math.max(0.03, it.line_total * 0.01)) {
      flagged[i] = `${it.quantity} x ${it.unit_price.toFixed(2)} is ${expected.toFixed(2)}, but the line says ${it.line_total.toFixed(2)}`;
      score += 2;
    }
  });
  const lineIssues = Object.keys(flagged).length;
  if (lineIssues > 0) issues.push(`${lineIssues} ${lineIssues === 1 ? "line has" : "lines have"} a quantity and price that do not match its amount.`);

  const itemsSum = r2(scan.items.reduce((s, it) => s + it.line_total, 0));
  let diff: number | null = null;
  if (scan.total != null && scan.items.length > 0) {
    const total = scan.total;
    const target = scan.subtotal != null ? scan.subtotal : scan.tax != null ? r2(total - scan.tax) : total;
    const tol = Math.max(0.05, target * 0.003);
    diff = r2(itemsSum - target);
    // No subtotal or tax printed: a gap below the total may simply be tax
    const maybeTax = scan.subtotal == null && scan.tax == null && diff < 0 && -diff <= total * 0.15;
    if (Math.abs(diff) > tol && !maybeTax) {
      score += 3 + Math.min(5, (Math.abs(diff) / Math.max(total, 1)) * 10);
      if (diff > 0) {
        issues.unshift(`The items add up to ${itemsSum.toFixed(2)}, ${diff.toFixed(2)} more than the receipt ${scan.subtotal != null ? "subtotal" : "total"}.`);
        const twice = scan.items.findIndex((it) => Math.abs(it.line_total - diff!) < 0.011);
        if (twice >= 0 && !flagged[twice]) flagged[twice] = "This price equals the extra amount: the line may be counted twice or may be a discount";
      } else {
        issues.unshift(`The items add up to ${itemsSum.toFixed(2)}, ${(-diff).toFixed(2)} less than the receipt ${scan.subtotal != null ? "subtotal" : "total"}. A line may be missing or a price misread.`);
      }
    } else {
      diff = Math.abs(diff) <= tol ? 0 : diff;
    }
  }

  return { ok: score === 0, itemsSum, diff, issues, flagged, score };
}

const digitsOf = (n: number) => n.toFixed(2).replace(".", "");

/** One wrong character apart (2.49 vs 2.48), or two neighbouring digits swapped (2.49 vs 4.29 is not one, 2.49 vs 2.94 is). */
function nearMiss(a: number, b: number): boolean {
  const x = digitsOf(a), y = digitsOf(b);
  if (x === y) return false;
  if (x.length !== y.length) return false;
  let d = 0, firstAt = -1;
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) { d++; if (firstAt < 0) firstAt = i; }
  if (d === 1) return true;
  return d === 2 && x[firstAt] === y[firstAt + 1] && x[firstAt + 1] === y[firstAt];
}

export type CrossCheck = {
  /** Row index -> reason, only where the two readers disagree on a price. */
  flagged: Record<number, string>;
  /** Row index -> the other reader's price, when it differs by a slip (one wrong digit, two swapped). */
  alts: Record<number, number>;
  /** How many AI prices the on-device reader found too. */
  agreed: number;
  /** Which rows those are (indexes into the AI items). */
  agreedRows: number[];
  /** False when the on-device reading was too poor to judge anything from (then nothing is flagged). */
  trusted: boolean;
  /** Prices the on-device reader found on item lines that the AI did not list. */
  extra: number[];
};

/**
 * Compares the AI's items with an independent on-device reading of the same photo. The on-device reading is only
 * used as a witness when it recognised at least half of the AI's prices; otherwise it is too noisy to say anything.
 */
export function crossCheck(aiItems: GroceryLine[], ocr: { text: string; items: GroceryLine[] }): CrossCheck {
  const pool = new Map<number, number>();
  for (const p of moneyTokens(ocr.text)) pool.set(p, (pool.get(p) || 0) + 1);
  const take = (p: number) => {
    const n = pool.get(p) || 0;
    if (n > 0) { pool.set(p, n - 1); return true; }
    return false;
  };

  const found = aiItems.map((it) => take(it.line_total));
  const agreed = found.filter(Boolean).length;
  const share = aiItems.length ? agreed / aiItems.length : 0;
  if (aiItems.length === 0 || share < 0.5) return { flagged: {}, alts: {}, agreed, agreedRows: [], trusted: false, extra: [] };

  const flagged: Record<number, string> = {};
  const alts: Record<number, number> = {};
  aiItems.forEach((it, i) => {
    if (found[i]) return;
    const near = [...pool.entries()].find(([p, n]) => n > 0 && nearMiss(it.line_total, p));
    if (near) {
      flagged[i] = `The AI read ${it.line_total.toFixed(2)}, the on-device reader saw ${near[0].toFixed(2)}`;
      alts[i] = near[0];
      take(near[0]);
    } else if (share >= 0.8) {
      flagged[i] = "The on-device reader could not find this price on the receipt";
    }
  });

  // Prices on item lines that the AI never listed (a skipped line)
  const aiTotals = new Map<number, number>();
  for (const it of aiItems) aiTotals.set(it.line_total, (aiTotals.get(it.line_total) || 0) + 1);
  const extra: number[] = [];
  if (share >= 0.8) {
    for (const it of ocr.items) {
      const n = aiTotals.get(it.line_total) || 0;
      if (n > 0) aiTotals.set(it.line_total, n - 1);
      else extra.push(it.line_total);
    }
  }
  return { flagged, alts, agreed, agreedRows: found.map((f, i) => (f ? i : -1)).filter((i) => i >= 0), trusted: true, extra };
}

/** Folds several flag sets into the items and returns the combined plain-language issues. */
export function applyFlags(items: GroceryLine[], ...sets: Record<number, string>[]): number {
  let n = 0;
  items.forEach((it, i) => {
    const reasons = sets.map((s) => s[i]).filter(Boolean);
    if (reasons.length) { it.flag = reasons[0]; n++; }
  });
  return n;
}

const nameKey = (n: string) => n.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/**
 * Compares a second reading with the first, row by row (matched by name, or by position when the lists are the
 * same length). Rows where the amount changed get the new amount as a suggestion; lines only the second reading has are counted.
 */
export function diffReadings(first: GroceryLine[], second: GroceryLine[]): { flagged: Record<number, string>; alts: Record<number, number>; added: number } {
  const flagged: Record<number, string> = {};
  const alts: Record<number, number> = {};
  const used = new Set<number>();
  first.forEach((it, i) => {
    let j = second.findIndex((o, k) => !used.has(k) && nameKey(o.name) === nameKey(it.name));
    if (j < 0 && first.length === second.length && !used.has(i)) j = i;
    if (j < 0) return;
    used.add(j);
    const other = second[j];
    if (Math.abs(other.line_total - it.line_total) > 0.005) {
      alts[i] = other.line_total;
      flagged[i] = `The AI read ${it.line_total.toFixed(2)}, its second look read ${other.line_total.toFixed(2)}`;
    }
  });
  return { flagged, alts, added: second.filter((_, k) => !used.has(k)).length };
}
