/** Reminders shared through partners: who a reminder is shared with, and who sent one that was shared with you. */

export type ReminderShareRow = { reminder_id: string; partnership_id: string; can_complete: boolean };
export type ReminderFromRow = { reminder_id: string; owner_name: string | null };
export type SharedPerson = { partnershipId: string; name: string; canComplete: boolean };

const AVATAR_COLOURS = ["#7c3aed", "#0d9488", "#d97706", "#db2777", "#2563eb", "#16a34a"];

/** The same person always gets the same colour. */
export function avatarColour(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLOURS[h % AVATAR_COLOURS.length];
}
export const initialOf = (name: string) => (name.trim()[0] ?? "?").toUpperCase();

/** Per reminder, the people it is shared with. A partner that is no longer active is left out. */
export function peopleByReminder(rows: ReminderShareRow[], partnerNames: Map<string, string>): Map<string, SharedPerson[]> {
  const out = new Map<string, SharedPerson[]>();
  for (const r of rows) {
    const name = partnerNames.get(r.partnership_id);
    if (!name) continue;
    const list = out.get(r.reminder_id) ?? [];
    list.push({ partnershipId: r.partnership_id, name, canComplete: r.can_complete });
    out.set(r.reminder_id, list);
  }
  for (const l of out.values()) l.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

export function fromByReminder(rows: ReminderFromRow[]): Map<string, string> {
  return new Map(rows.map((r) => [r.reminder_id, r.owner_name || "Someone"]));
}

/** "Maria", "Maria and Alex", "Maria, Alex and Sam" */
export function namesText(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
