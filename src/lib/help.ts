/**
 * Help topics: types, the tiny text format they are written in, and search/grouping. Pure functions (unit-tested).
 *
 * The body is plain text with a few marks, never HTML, so a topic can not run script or inject markup:
 *   ## Heading            a sub heading
 *   1. Step               numbered steps (a run of lines)
 *   - Point               bullet points (a run of lines)
 *   > Tip text            a highlighted tip
 *   **bold**              bold text inside a line
 *   anything else         a paragraph (blank lines separate blocks)
 */

export type HelpTopic = {
  id: string;
  slug: string;
  title: string;
  category: string;
  summary: string;
  body: string;
  sort_order: number;
  published: boolean;
  updated_at: string;
};

export const HELP_LIMITS = { title: 120, category: 40, summary: 240, body: 8000 } as const;
export const DEFAULT_HELP_CATEGORY = "General";

export type HelpInline = { text: string; bold: boolean };
export type HelpBlock =
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; inline: HelpInline[] }
  | { kind: "steps"; items: HelpInline[][] }
  | { kind: "bullets"; items: HelpInline[][] }
  | { kind: "tip"; inline: HelpInline[] };

/** "Use **bold** here" -> [{text:"Use ",bold:false},{text:"bold",bold:true},{text:" here",bold:false}] */
export function parseInline(line: string): HelpInline[] {
  const out: HelpInline[] = [];
  const parts = line.split("**");
  // an odd number of ** leaves the last mark unmatched: show it as normal text
  const matched = parts.length % 2 === 1 ? parts.length : parts.length - 1;
  parts.forEach((p, i) => {
    if (i >= matched) {
      const last = out[out.length - 1];
      const t = "**" + p;
      if (last && !last.bold) last.text += t;
      else out.push({ text: t, bold: false });
      return;
    }
    if (p === "") return;
    out.push({ text: p, bold: i % 2 === 1 });
  });
  return out;
}

export function parseHelpBody(body: string): HelpBlock[] {
  const lines = (body || "").replace(/\r\n?/g, "\n").split("\n");
  const blocks: HelpBlock[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ kind: "paragraph", inline: parseInline(para.join(" ")) });
    para = [];
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^#{1,6}\s+(.+)$/))) {
      flush();
      blocks.push({ kind: "heading", text: m[1].replace(/\*\*/g, "").trim() });
    } else if ((m = line.match(/^\d+[.)]\s+(.+)$/))) {
      flush();
      const last = blocks[blocks.length - 1];
      if (last?.kind === "steps") last.items.push(parseInline(m[1]));
      else blocks.push({ kind: "steps", items: [parseInline(m[1])] });
    } else if ((m = line.match(/^[-*•]\s+(.+)$/))) {
      flush();
      const last = blocks[blocks.length - 1];
      if (last?.kind === "bullets") last.items.push(parseInline(m[1]));
      else blocks.push({ kind: "bullets", items: [parseInline(m[1])] });
    } else if ((m = line.match(/^>\s*(.+)$/))) {
      flush();
      blocks.push({ kind: "tip", inline: parseInline(m[1].replace(/^tip:\s*/i, "")) });
    } else {
      para.push(line);
    }
  }
  flush();
  return blocks;
}

/** "How do I add a card?" -> "how-do-i-add-a-card" (max 80 chars). Empty when nothing usable is left. */
export function slugifyTopic(title: string): string {
  return (title || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

export type HelpDraft = { title: string; category: string; summary: string; body: string; sort_order: number | string; published: boolean };

/** Cleans the form and says what is wrong, in words for the person typing. */
export function validateHelpDraft(d: HelpDraft): { ok: true; value: Omit<HelpDraft, "sort_order"> & { sort_order: number } } | { ok: false; error: string } {
  const title = (d.title || "").trim();
  const category = (d.category || "").trim() || DEFAULT_HELP_CATEGORY;
  const summary = (d.summary || "").trim();
  const body = (d.body || "").replace(/\r\n?/g, "\n").trim();
  if (title.length < 2) return { ok: false, error: "Give the topic a title." };
  if (title.length > HELP_LIMITS.title) return { ok: false, error: `The title can be at most ${HELP_LIMITS.title} characters.` };
  if (!slugifyTopic(title)) return { ok: false, error: "The title needs some letters or numbers." };
  if (category.length > HELP_LIMITS.category) return { ok: false, error: `The category can be at most ${HELP_LIMITS.category} characters.` };
  if (summary.length > HELP_LIMITS.summary) return { ok: false, error: `The short description can be at most ${HELP_LIMITS.summary} characters.` };
  if (body.length > HELP_LIMITS.body) return { ok: false, error: `The text is ${body.length - HELP_LIMITS.body} characters too long (limit ${HELP_LIMITS.body}).` };
  const n = Math.round(Number(d.sort_order));
  const sort_order = Number.isFinite(n) ? Math.min(Math.max(n, 0), 9999) : 100;
  return { ok: true, value: { title, category, summary, body, sort_order, published: !!d.published } };
}

const norm = (s: string) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Every word typed must appear in the title, summary, category or text. Title hits come first. */
export function searchTopics(topics: HelpTopic[], query: string): HelpTopic[] {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (!words.length) return topics;
  const scored: { t: HelpTopic; score: number }[] = [];
  for (const t of topics) {
    const title = norm(t.title);
    const rest = norm(`${t.summary} ${t.category} ${t.body.replace(/[*#>]/g, " ")}`);
    if (!words.every((w) => title.includes(w) || rest.includes(w))) continue;
    scored.push({ t, score: words.reduce((s, w) => s + (title.includes(w) ? 2 : 0), 0) });
  }
  return scored.sort((a, b) => b.score - a.score).map((x) => x.t);
}

/** Topics grouped by category, categories in the order of their first topic. */
export function groupByCategory(topics: HelpTopic[]): { category: string; topics: HelpTopic[] }[] {
  const sorted = [...topics].sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title));
  const groups = new Map<string, HelpTopic[]>();
  for (const t of sorted) {
    const list = groups.get(t.category) ?? [];
    list.push(t);
    groups.set(t.category, list);
  }
  return [...groups.entries()].map(([category, list]) => ({ category, topics: list }));
}
