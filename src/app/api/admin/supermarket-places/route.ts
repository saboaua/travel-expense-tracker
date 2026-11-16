import { NextResponse } from "next/server";
import { requireAdminService } from "@/lib/admin-roles-api";
import { logAudit } from "@/lib/audit";
import { filterPlaces, isFilter, readFix, viewPlaces, type PlaceRow } from "@/lib/personal/places-fix";
import { nameKey } from "@/lib/personal/supermarket-import";

export const dynamic = "force-dynamic";
const SHOW = 100;
const SETUP = "Run supabase/migration_places_fix.sql first.";
const isMissing = (m: string) => /relation|schema cache|column/i.test(m);

/** The saved places with warnings. ?q= searches name and address, ?filter= is all, fixed, outside or same. */
export async function GET(request: Request) {
  const a = await requireAdminService();
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").slice(0, 80);
  const f = url.searchParams.get("filter");
  const filter = isFilter(f) ? f : "all";
  const rows: PlaceRow[] = [];
  let fixedColumn = true;
  for (let from = 0; from < 10000; from += 1000) {
    let r = await a.admin.from("supermarket_places").select("id, name, address, lat, lng, fixed").order("id").range(from, from + 999);
    if (r.error && isMissing(r.error.message)) { fixedColumn = false; r = await a.admin.from("supermarket_places").select("id, name, address, lat, lng").order("id").range(from, from + 999) as typeof r; }
    if (r.error) return NextResponse.json({ error: isMissing(r.error.message) ? "Run supabase/migration_supermarket_places.sql first." : r.error.message }, { status: 500 });
    rows.push(...((r.data ?? []) as unknown as PlaceRow[]));
    if ((r.data ?? []).length < 1000) break;
  }
  const all = viewPlaces(rows).sort((x, y) => x.name.localeCompare(y.name));
  const hit = filterPlaces(all, q, filter);
  return NextResponse.json({
    total: all.length, matches: hit.length, shown: Math.min(SHOW, hit.length), setupNeeded: !fixedColumn,
    counts: { fixed: all.filter((p) => p.fixed).length, outside: all.filter((p) => p.flag === "outside").length, same: all.filter((p) => p.flag === "same").length },
    places: hit.slice(0, SHOW),
  }, { headers: { "Cache-Control": "no-store" } });
}

/** Body: { id, name, address, lat, lng }. Marks the place as fixed by hand and remembers where the file had it. */
export async function PUT(request: Request) {
  const a = await requireAdminService();
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const body = await request.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Choose a place." }, { status: 400 });
  const fix = readFix(body);
  if (!fix.ok) return NextResponse.json({ error: fix.error }, { status: 400 });
  const { data: was, error: e1 } = await a.admin.from("supermarket_places").select("name, name_key, lat, lng, fixed, orig_lat, orig_lng, orig_key").eq("id", id).maybeSingle();
  if (e1) return NextResponse.json({ error: isMissing(e1.message) ? SETUP : e1.message }, { status: 500 });
  if (!was) return NextResponse.json({ error: "That place is already gone. Reload the list." }, { status: 404 });
  const patch = { name: fix.name, name_key: nameKey(fix.name), address: fix.address, lat: fix.lat, lng: fix.lng, fixed: true, orig_lat: was.fixed ? was.orig_lat : was.lat, orig_lng: was.fixed ? was.orig_lng : was.lng, orig_key: was.fixed && was.orig_key ? was.orig_key : was.name_key };
  const { error } = await a.admin.from("supermarket_places").update(patch).eq("id", id);
  if (error) {
    const dup = /duplicate|unique/i.test(error.message);
    return NextResponse.json({ error: dup ? "A place with this name is already on that exact point." : isMissing(error.message) ? SETUP : error.message }, { status: dup ? 409 : 500 });
  }
  await logAudit({ actorId: a.me.id, actorEmail: a.me.email, action: "places.fixed", entityType: "supermarket_places", entityId: id, details: { name: fix.name, from: `${was.lat}, ${was.lng}`, to: `${fix.lat}, ${fix.lng}` } }).catch(() => {});
  return NextResponse.json({ ok: true });
}

/** Body: { id }. The place is removed for everyone and a later import will not bring it back. */
export async function DELETE(request: Request) {
  const a = await requireAdminService();
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const body = await request.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Choose a place." }, { status: 400 });
  const { data: was, error: e1 } = await a.admin.from("supermarket_places").select("name, name_key, lat, lng, fixed, orig_lat, orig_lng, orig_key").eq("id", id).maybeSingle();
  if (e1) return NextResponse.json({ error: isMissing(e1.message) ? SETUP : e1.message }, { status: 500 });
  if (!was) return NextResponse.json({ ok: true });
  // Remember the file's own point for it, so the next import skips it
  const mark = await a.admin.from("supermarket_places_removed").upsert({ name_key: was.fixed && was.orig_key ? was.orig_key : was.name_key, lat: was.fixed && was.orig_lat != null ? was.orig_lat : was.lat, lng: was.fixed && was.orig_lng != null ? was.orig_lng : was.lng }, { onConflict: "name_key,lat,lng" });
  if (mark.error) return NextResponse.json({ error: isMissing(mark.error.message) ? SETUP : mark.error.message }, { status: 500 });
  const { error } = await a.admin.from("supermarket_places").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logAudit({ actorId: a.me.id, actorEmail: a.me.email, action: "places.removed", entityType: "supermarket_places", entityId: id, details: { name: was.name, at: `${was.lat}, ${was.lng}` } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
