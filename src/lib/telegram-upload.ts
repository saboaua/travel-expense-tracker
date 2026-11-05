/** Decides where a photo or PDF sent to the bot goes. Pure, so the rules are tested without Telegram. */
import { suggestDestination, type ScanOption } from "@/lib/scan-destination";
import { captionTarget } from "@/lib/telegram-commands";

export type UploadDecision = {
  pick: ScanOption | null;
  /** true: save now (with a Change button). false: ask first, best guess listed first. */
  confident: boolean;
  reason: string | null;
  /** What the buttons offer, best guess first */
  choices: ScanOption[];
};

const covers = (o: ScanOption, d: string) => !!o.start && o.start <= d && d <= (o.end || o.start);

export function decideUpload(i: {
  options: ScanOption[];
  caption?: string | null;
  isPdf: boolean;
  today: string;
  /** Default trip chosen with /trips, as an option key */
  defaultKey?: string | null;
  /** Where the last upload went */
  last?: string | null;
}): UploadDecision {
  const doc = i.options.find((o) => o.kind === "document") ?? null;
  const order = (pick: ScanOption | null, list: ScanOption[]) => (pick ? [pick, ...list.filter((o) => o.key !== pick.key)] : list);
  const make = (pick: ScanOption | null, confident: boolean, reason: string | null, list = i.options): UploadDecision => ({ pick, confident, reason, choices: order(pick, list).slice(0, 8) });

  const named = captionTarget(i.caption, i.options);
  if (named) return make(named, true, "From your caption");

  // Receipts are read from photos; a PDF can only be kept as a document
  if (i.isPdf && doc) return make(doc, true, "PDFs are kept as documents");

  const def = i.defaultKey ? i.options.find((o) => o.key === i.defaultKey) ?? null : null;
  if (def && covers(def, i.today)) return make(def, true, "Your default trip");

  const s = suggestDestination({ mode: "upload", options: i.options, photoDate: i.today, today: i.today, last: i.defaultKey && def ? def.key : i.last });
  const reason = s.reason?.startsWith("Photo taken during") ? `Trip in progress: ${s.pick?.label}` : s.reason;
  return make(s.pick, s.confident && !!s.pick, reason);
}

/** "expenses:<uuid>" is what a saved upload is recorded as, so Change can find and remove it. */
export type SavedRef = { table: "expenses" | "personal_expenses" | "grocery_receipts" | "travel_documents"; id: string };
const TABLES = new Set(["expenses", "personal_expenses", "grocery_receipts", "travel_documents"]);

export function parseSavedRef(ref: string | null | undefined): SavedRef | null {
  const m = /^([a-z_]+):([0-9a-f-]{36})$/i.exec(ref || "");
  return m && TABLES.has(m[1]) ? { table: m[1] as SavedRef["table"], id: m[2] } : null;
}
export const formatSavedRef = (r: SavedRef) => `${r.table}:${r.id}`;

/** Telegram allows 64 bytes of callback data. Keys are "trip:<uuid>" (46 chars) at most, so "dest:" fits. */
export const destCallback = (key: string) => `dest:${key}`;
export const parseDestCallback = (data: string) => (data.startsWith("dest:") ? data.slice(5) : null);
