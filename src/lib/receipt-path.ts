/**
 * Receipt files are stored under the owner's id ("<user id>/<trip>/<file>"). True only for a plain path inside the
 * given person's own folder, with no way to climb out of it.
 */
export function isOwnReceiptPath(path: unknown, userId: string): boolean {
  if (typeof path !== "string" || !userId || path.length > 300) return false;
  if (!path.startsWith(`${userId}/`)) return false;
  const parts = path.split("/");
  return parts.every((p) => p !== "" && p !== "." && p !== ".." && !/[\\\u0000-\u001f]/.test(p));
}
