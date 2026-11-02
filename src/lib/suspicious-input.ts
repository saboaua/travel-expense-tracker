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

export type SuspiciousHit = { field: string; pattern: string; snippet: string };

export function scanFields(fields: Record<string, unknown>): SuspiciousHit[] {
  const hits: SuspiciousHit[] = [];
  for (const [field, value] of Object.entries(fields)) {
    if (typeof value !== "string" || !value) continue;
    const text = value.slice(0, 5000);
    for (const [pattern, re] of PATTERNS) {
      if (re.test(text)) {
        hits.push({ field, pattern, snippet: text.slice(0, 120) });
        break;
      }
    }
  }
  return hits;
}
