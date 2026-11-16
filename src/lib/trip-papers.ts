import { addDaysISO } from "@/lib/utils";

/** Trip papers: transfers, tickets and booking details kept with one trip, and removed a week after it ends. */

export const PAPER_COLS = "id, trip_id, title, note, file_path, created_at";
export const PAPER_KEEP_DAYS = 7;
export const PAPER_BUCKET = "documents";

export type TripPaper = { id: string; trip_id: string; title: string; note: string | null; file_path: string | null; created_at: string };

/** The day the papers of a trip are removed, or null while the trip has no end date. */
export function paperRemovalDay(endDate: string | null | undefined): string | null {
  return endDate ? addDaysISO(endDate, PAPER_KEEP_DAYS) : null;
}

/** Is it time to remove the papers of a trip that ended on this day? */
export function papersDue(endDate: string | null | undefined, today: string): boolean {
  const day = paperRemovalDay(endDate);
  return !!day && day <= today;
}

/** The latest end date whose papers are due today: trips that ended on or before it. */
export const dueEndDate = (today: string) => addDaysISO(today, -PAPER_KEEP_DAYS);

/** The second line of a paper: the note, and what file it carries. */
export function paperSub(p: Pick<TripPaper, "note" | "file_path">): string {
  const ext = (p.file_path || "").toLowerCase().split("?")[0].split(".").pop() || "";
  const file = !p.file_path ? "Note only" : ext === "pdf" ? "PDF" : "Photo";
  const note = (p.note || "").replace(/\s+/g, " ").trim();
  if (!note) return file === "Note only" ? "" : file;
  const short = note.length > 60 ? note.slice(0, 57) + "…" : note;
  return file === "Note only" ? short : `${short} · ${file}`;
}

/** The papers shown on the dashboard trip card: the two added last. */
export const latestPapers = (papers: TripPaper[], n = 2): TripPaper[] => [...papers].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, n);

export function parsePaper(input: { title?: unknown; note?: unknown }): { ok: true; title: string; note: string | null } | { ok: false; error: string } {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const note = typeof input.note === "string" ? input.note.trim() : "";
  if (!title) return { ok: false, error: "Give the paper a title." };
  if (title.length > 120) return { ok: false, error: "The title is too long. Use up to 120 characters." };
  if (note.length > 1000) return { ok: false, error: "The note is too long. Use up to 1000 characters." };
  return { ok: true, title, note: note || null };
}
