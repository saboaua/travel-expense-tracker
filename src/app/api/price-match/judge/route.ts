import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { judgeConfigured, judgePairs, MAX_JUDGED, pairKey, type Pair } from "@/lib/match-judge";

/**
 * "Same product?" questions in the Price tracker: the AI that already reads receipts gives its opinion on a pair of names.
 * Only the two product names are sent. The verdict is kept for everyone (product_match_cache), so a pair is judged once.
 * It is only an opinion shown beside the question; the person always decides. Nothing here can fail the page: no AI, no table
 * or a slow answer returns "unknown" for those pairs.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await rateLimit(`pricematch:${user.id}`, 60, 3600))) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  let body: { pairs?: { a?: unknown; b?: unknown }[] };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }
  const pairs: Pair[] = (Array.isArray(body.pairs) ? body.pairs : []).slice(0, MAX_JUDGED).map((p) => ({
    wanted: typeof p.a === "string" ? p.a.slice(0, 160) : "",
    shop: typeof p.b === "string" ? p.b.slice(0, 160) : "",
  }));
  const answers: (boolean | null)[] = pairs.map(() => null);
  if (!judgeConfigured() || pairs.length === 0 || pairs.some((p) => !p.wanted || !p.shop)) return NextResponse.json({ answers });

  try {
    const keys = pairs.map((p) => pairKey(p));
    const { data } = await supabase.from("product_match_cache").select("pair_key, same").in("pair_key", keys);
    const known = new Map(((data ?? []) as { pair_key: string; same: boolean }[]).map((r) => [r.pair_key, r.same]));
    keys.forEach((k, i) => { if (known.has(k)) answers[i] = known.get(k) ?? null; });
    const todo = Array.from(keys.keys()).filter((i) => answers[i] === null);
    if (todo.length) {
      const got = await judgePairs(todo.map((i) => pairs[i]));
      if (got) {
        todo.forEach((i, n) => { answers[i] = got[n]; });
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL, service = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (url && service) {
          const db = createServiceClient(url, service, { auth: { persistSession: false } });
          await db.from("product_match_cache").upsert(todo.map((i, n) => ({ pair_key: keys[i], same: got[n] })), { onConflict: "pair_key" });
        }
      }
    }
  } catch { /* an opinion is an extra */ }
  return NextResponse.json({ answers });
}
