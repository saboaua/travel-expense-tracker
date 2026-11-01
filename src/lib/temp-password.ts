import { randomInt } from "crypto";
import { TEMP_PASSWORD_TTL_HOURS } from "@/lib/temp-password-config";

export { TEMP_PASSWORD_TTL_HOURS, isTempPasswordExpired } from "@/lib/temp-password-config";

const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnpqrstuvwxyz";
const DIGITS = "23456789";
const ALL = UPPER + LOWER + DIGITS;

const pick = (set: string) => set[randomInt(set.length)];

/** Cryptographically secure 14-character password (no look-alike characters). */
export function generateTempPassword(length = 14): string {
  const chars = [pick(UPPER), pick(LOWER), pick(DIGITS)];
  while (chars.length < length) chars.push(pick(ALL));
  // Fisher-Yates shuffle with a secure RNG
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

export function tempPasswordWindow(now = new Date()) {
  return {
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + TEMP_PASSWORD_TTL_HOURS * 3600 * 1000).toISOString(),
  };
}
