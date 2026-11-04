/**
 * Signal-only detection of common attack strings (SQL injection, script injection, path traversal).
 * It never blocks anything: it only produces a hint for the security log. Real protection comes from
 * parameterised queries (Supabase client) and React's output escaping.
 */
const PATTERNS: [string, RegExp][] = [
  ["sql_union_select", /\bunion\b[\s\S]{0,30}\bselect\b/i],
  ["sql_tautology", /['"]\s*(or|and)\s+['"]?\w+['"]?\s*=\s*['"]?\w+/i],
  ["sql_stacked_query", /;\s*(drop|delete|insert|update|alter|truncate|exec)\b/i],
  ["sql_comment_terminator", /(['"])\s*(--|#|\/\*)/],
  ["sql_time_based", /\b(pg_sleep|sleep|benchmark|waitfor\s+delay)\s*\(/i],
  ["script_tag", /<\s*script\b/i],
  ["js_protocol_or_handler", /javascript\s*:|\bon(error|load|click|mouseover)\s*=/i],
  ["path_traversal", /\.\.[\/\\]/],
];

/** Undo common disguises (URL / HTML entity encoding, curly quotes) so encoded attacks are caught too. */
export function normalizeForScan(text: string): string {
  let t = text;
  for (let i = 0; i < 2; i++) {
    try {
      const decoded = decodeURIComponent(t.replace(/\+/g, " "));
      if (decoded === t) break;
      t = decoded;
    } catch {
      break;
    }
  }
  return t
    .replace(/&#x27;|&#39;|&apos;/gi, "'")
    .replace(/&quot;|&#x22;|&#34;/gi, '"')
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[\u2018\u2019\u02bc\uff07]/g, "'")
    .replace(/[\u201c\u201d\uff02]/g, '"');
}

export type SuspiciousHit = { field: string; pattern: string; snippet: string };

export function scanFields(fields: Record<string, unknown>): SuspiciousHit[] {
  const hits: SuspiciousHit[] = [];
  for (const [field, value] of Object.entries(fields)) {
    if (typeof value !== "string" || !value) continue;
    const text = value.slice(0, 5000);
    const normalized = normalizeForScan(text);
    for (const [pattern, re] of PATTERNS) {
      if (re.test(text) || re.test(normalized)) {
        hits.push({ field, pattern, snippet: text.slice(0, 120) });
        break;
      }
    }
  }
  return hits;
}
