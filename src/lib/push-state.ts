import type { PushSupport } from "@/lib/push-client";

/**
 * What alerts on this device really are. "on" needs the phone and the server to agree.
 *  - repair: the phone has a subscription and permission, but the server has no row for it (it was removed or taken over)
 *  - restore: you asked for alerts before, but this device has no subscription now (new install, reset phone, permission cleared)
 */
export type PushState = "unsupported" | "needs-install" | "on" | "repair" | "restore" | "blocked" | "off";

export function pushState(i: { support: PushSupport; permission: NotificationPermission | "none"; hasSub: boolean; registered: boolean; wanted: boolean }): PushState {
  if (i.support !== "ok") return i.support;
  if (i.permission === "denied") return i.wanted ? "blocked" : "off";
  if (i.hasSub && i.permission === "granted") return i.registered ? "on" : "repair";
  return i.wanted ? "restore" : "off";
}
