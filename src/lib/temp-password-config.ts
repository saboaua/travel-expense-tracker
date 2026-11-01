/** How long an admin-issued temporary password stays valid (hours). Safe to import from client code. */
export const TEMP_PASSWORD_TTL_HOURS = 24;

export function isTempPasswordExpired(mustChange: boolean | null | undefined, expiresAt: string | null | undefined) {
  return !!mustChange && !!expiresAt && new Date(expiresAt).getTime() < Date.now();
}
