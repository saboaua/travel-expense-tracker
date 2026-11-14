/** Recommend Lifolio: the invite link and the message a friend receives. Pure, so it is unit-tested. */
export const INVITE_CODE = /^[A-Z0-9]{10}$/;
export const isInviteCode = (v: unknown): v is string => typeof v === "string" && INVITE_CODE.test(v);
export const inviteUrl = (origin: string, code: string) => `${origin.replace(/\/+$/, "")}/invite/${code}`;
export const inviteMessage = (url: string) => `Hi! I use Lifolio for my trips, receipts, groceries and bills, all in one place. Have a look: ${url}`;
/** First name for the invite page: the first name if there is one, else the first word of the full name. Empty when nothing usable. */
export function firstNameOf(first: string | null | undefined, full: string | null | undefined): string {
  const n = (first ?? "").trim() || (full ?? "").trim().split(/\s+/)[0] || "";
  return n.slice(0, 40);
}
