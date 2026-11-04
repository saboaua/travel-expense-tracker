/**
 * Content-Security-Policy for every page. Scripts need a per-request nonce, so an injected <script> or
 * inline handler cannot run even if some user text were ever rendered unescaped.
 *
 * Rollout: the policy is sent as Content-Security-Policy-Report-Only first (violations are logged to the
 * security log by /api/csp-report). Set CSP_ENFORCE=1 in the environment to start blocking.
 */
export type CspOptions = { nonce: string; dev?: boolean; supabaseUrl?: string | null };

function originOf(url: string | null | undefined): string | null {
  try {
    return url ? new URL(url).origin : null;
  } catch {
    return null;
  }
}

export function buildCsp({ nonce, dev = false, supabaseUrl }: CspOptions): string {
  const supabase = originOf(supabaseUrl);
  const supabaseWs = supabase ? supabase.replace(/^http/, "ws") : null;

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // 'strict-dynamic' lets the nonce-approved Next.js bootstrap load its own chunks; host lists are then ignored.
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", "'wasm-unsafe-eval'", ...(dev ? ["'unsafe-eval'"] : [])],
    // React and Tailwind use inline style attributes; styles cannot run code, so this stays relaxed.
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", ...(supabase ? [supabase] : ["https://*.supabase.co"]), "https://upload.wikimedia.org"],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", ...(supabase ? [supabase, ...(supabaseWs ? [supabaseWs] : [])] : ["https://*.supabase.co", "wss://*.supabase.co"]), ...(dev ? ["ws:", "wss:"] : [])],
    // On-device OCR runs in a worker served from /tesseract
    "worker-src": ["'self'", "blob:"],
    // Signed Supabase links open PDFs inside the document viewer
    "frame-src": [...(supabase ? [supabase] : ["https://*.supabase.co"])],
    "manifest-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
    ...(dev ? {} : { "upgrade-insecure-requests": [] }),
    "report-uri": ["/api/csp-report"],
    "report-to": ["csp"],
  };

  return Object.entries(directives)
    .map(([name, values]) => [name, ...values].join(" "))
    .join("; ");
}

/** Random per-request value (base64 of a UUID); works in the edge runtime. */
export function makeNonce(): string {
  return btoa(crypto.randomUUID());
}

export function cspHeaderName(enforce: boolean): "Content-Security-Policy" | "Content-Security-Policy-Report-Only" {
  return enforce ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only";
}

/** Keeps the useful parts of a browser CSP report and caps their size. Returns null for junk. */
export function summarizeReport(body: unknown): { directive: string; blocked: string; document: string; sample: string; disposition: string } | null {
  const raw = (body as { "csp-report"?: Record<string, unknown> } | null)?.["csp-report"] ?? (Array.isArray(body) ? (body[0] as { body?: Record<string, unknown> })?.body : (body as { body?: Record<string, unknown> } | null)?.body);
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const s = (...keys: string[]) => {
    for (const k of keys) if (typeof r[k] === "string" && r[k]) return (r[k] as string).slice(0, 200);
    return "";
  };
  const directive = s("effective-directive", "effectiveDirective", "violated-directive", "violatedDirective");
  if (!directive) return null;
  return {
    directive,
    blocked: s("blocked-uri", "blockedURL", "blockedURI"),
    document: s("document-uri", "documentURL", "documentURI"),
    sample: s("script-sample", "sample").slice(0, 80),
    disposition: s("disposition") || "report",
  };
}
