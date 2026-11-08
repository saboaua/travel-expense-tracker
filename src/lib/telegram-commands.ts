/** Chat commands and captions, parsed without touching Telegram or the database. */
import type { NotifyPrefs } from "@/lib/telegram-notify";
import type { ScanOption } from "@/lib/scan-destination";

/** "/notify@MyBot quiet 22 7" -> { name: "notify", args: ["quiet", "22", "7"] } */
export function parseCommand(text: string): { name: string; args: string[] } | null {
  const t = text.trim();
  if (!t.startsWith("/")) return null;
  const [head, ...rest] = t.split(/\s+/);
  const name = head.slice(1).split("@")[0].toLowerCase();
  return name ? { name, args: rest } : null;
}

const fmtHour = (h: number) => `${String(h).padStart(2, "0")}:00`;

export function notifyStatus(p: NotifyPrefs): string {
  return [
    `<b>Messages from the app: ${p.enabled ? "on" : "off"}</b>`,
    `Reminders and weekly summary: ${p.trip_reminders ? "on" : "off"}`,
    `Admin alerts: ${p.admin_alerts ? "on" : "off"}`,
    `Quiet hours: ${p.quiet_start === p.quiet_end ? "none" : `${fmtHour(p.quiet_start)} to ${fmtHour(p.quiet_end)}`} (${p.tz})`,
    "",
    "/notify off — stop all messages",
    "/notify on — turn them back on",
    "/notify reminders on|off — reminders and the weekly summary",
    "/notify alerts on|off",
    "/notify quiet 22 7 — quiet from 22:00 to 07:00",
    "/notify quiet off",
  ].join("\n");
}

const flag = (v: string | undefined) => (v === "on" ? true : v === "off" ? false : null);
const hour = (v: string | undefined) => (v && /^\d{1,2}$/.test(v) && Number(v) <= 23 ? Number(v) : null);

/** Applies `/notify ...` and says what to reply. `patch` is empty when nothing changes. */
export function applyNotifyCommand(prefs: NotifyPrefs, args: string[]): { patch: Partial<NotifyPrefs>; reply: string } {
  const [a, b, c] = args.map((x) => x.toLowerCase());
  const done = (patch: Partial<NotifyPrefs>) => ({ patch, reply: `Saved.\n\n${notifyStatus({ ...prefs, ...patch })}` });
  if (!a) return { patch: {}, reply: notifyStatus(prefs) };
  if (a === "on" || a === "off") return done({ enabled: a === "on" });
  if (a === "reminders" && flag(b) !== null) return done({ trip_reminders: flag(b) as boolean });
  if (a === "alerts" && flag(b) !== null) return done({ admin_alerts: flag(b) as boolean });
  if (a === "quiet") {
    if (b === "off") return done({ quiet_start: 0, quiet_end: 0 });
    const s = hour(b), e = hour(c);
    if (s !== null && e !== null) return done({ quiet_start: s, quiet_end: e });
  }
  return { patch: {}, reply: `I did not understand that.\n\n${notifyStatus(prefs)}` };
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * A caption can say where the photo goes: "groceries", "document", or the name of a trip or project.
 * Returns the matching option or null. Longer names win, so "Miami Conference" beats "Miami".
 */
export function captionTarget(caption: string | null | undefined, options: ScanOption[]): ScanOption | null {
  const c = norm(caption || "").trim();
  if (!c) return null;
  const byKind = (k: ScanOption["kind"]) => options.find((o) => o.kind === k) ?? null;
  if (/\bgrocer/.test(c) || /\bsupermarket\b/.test(c)) return byKind("grocery");
  if (/\b(doc|docs|document|passport|visa|insurance)\b/.test(c)) return byKind("document");
  const named = options
    .filter((o) => o.kind !== "grocery" && o.kind !== "document" && norm(o.label).length >= 3 && c.includes(norm(o.label)))
    .sort((x, y) => y.label.length - x.label.length);
  return named[0] ?? null;
}
