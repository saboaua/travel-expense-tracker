/** Tells the server that I opened something a partner shared with me, so they can see it in their history. Best effort, once per item per visit. */
const seen = new Set<string>();
export function logShareView(kind: "loyalty_card" | "trip" | "personal_trip", itemId: string): void {
  const key = `${kind}:${itemId}`;
  if (seen.has(key)) return;
  seen.add(key);
  try {
    void fetch("/api/sharing/view", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, item_id: itemId }) }).catch(() => {});
  } catch {
    /* offline or blocked: the history simply misses this view */
  }
}
