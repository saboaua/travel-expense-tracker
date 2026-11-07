/**
 * The audit trail shows who did what, not how much money was involved. Amounts are masked before they leave the server:
 * every digit is hidden except the last one, so 5.45 shows as *.*5 and 1,234.50 as *,***.*0.
 */

/** "5.45" -> "*.*5". Keeps separators and the last digit; text without digits is returned as it is. */
export function maskNumber(value: unknown): string {
  return String(value).replace(/\d(?=[^]*\d)/g, "*");
}

const MONEY_KEY = /amount|total|price|cost|budget|rate|balance/i;

/** Masks the money fields of one audit row's details (the row itself is not changed). Nested objects and lists are covered. */
export function maskAuditDetails<T>(details: T): T {
  if (Array.isArray(details)) return details.map((d) => maskAuditDetails(d)) as unknown as T;
  if (details && typeof details === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(details as Record<string, unknown>)) {
      if (MONEY_KEY.test(k) && (typeof v === "number" || typeof v === "string") && /\d/.test(String(v))) out[k] = maskNumber(v);
      else out[k] = maskAuditDetails(v);
    }
    return out as T;
  }
  return details;
}

export function maskAuditRows<T extends object>(rows: T[]): T[] {
  return rows.map((r) => ({ ...r, details: maskAuditDetails((r as { details?: unknown }).details ?? {}) }));
}
