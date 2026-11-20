import { timingSafeEqual } from "crypto";

/** Is this a scheduled-job request carrying the CRON_SECRET? Fails closed: with no secret set, every request is refused. */
export function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = req.headers.get("authorization") || "";
  const want = `Bearer ${secret}`;
  return given.length === want.length && timingSafeEqual(Buffer.from(given), Buffer.from(want));
}
