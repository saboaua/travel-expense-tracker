import { NextResponse } from "next/server";
import { requireAdminService, isMissingTable } from "@/lib/admin-roles-api";
import { logAudit } from "@/lib/audit";
import { isMissingColumn } from "@/lib/columns";
import { parseAddresses } from "@/lib/bitcoin-address";
import { EMPTY_SETTINGS, PAYMENT_BASE_SETTINGS_COLS, PAYMENT_SETTINGS_COLS, parseSettings } from "@/lib/payments";

export const dynamic = "force-dynamic";
const MISSING = "Payments are not set up yet. Run supabase/migration_pro_payments.sql in the Supabase SQL Editor.";
const BTC_MISSING = "Bitcoin is not set up yet. Run supabase/migration_pro_bitcoin.sql in the Supabase SQL Editor.";
const BTC_FIELDS = ["btc_enabled", "btc_quote_minutes", "btc_confirmations"] as const;

export async function GET() {
  const ctx = await requireAdminService();
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  let res = await ctx.admin.from("payment_settings").select(PAYMENT_SETTINGS_COLS).eq("id", 1).maybeSingle();
  if (isMissingColumn(res.error)) res = (await ctx.admin.from("payment_settings").select(PAYMENT_BASE_SETTINGS_COLS).eq("id", 1).maybeSingle()) as typeof res;
  const { data, error } = res;
  if (error) return NextResponse.json({ error: isMissingTable(error.message) ? MISSING : error.message, setupNeeded: isMissingTable(error.message) }, { status: isMissingTable(error.message) ? 200 : 500 });
  const pool = await ctx.admin.from("btc_addresses").select("address, payment_id").order("created_at", { ascending: true }).limit(500);
  const bitcoinSetup = !pool.error;
  const addresses = (pool.data ?? []).map((a) => ({ address: a.address as string, used: !!a.payment_id }));
  return NextResponse.json({ settings: { ...EMPTY_SETTINGS, ...((data ?? {}) as object) }, bitcoinSetup, addresses });
}

export async function PUT(request: Request) {
  const ctx = await requireAdminService();
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const body = await request.json().catch(() => ({}));
  const parsed = parseSettings(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const row = { id: 1, ...parsed.value, updated_at: new Date().toISOString() };
  let { error } = await ctx.admin.from("payment_settings").upsert(row, { onConflict: "id" });
  if (isMissingColumn(error)) {
    if (parsed.value.btc_enabled) return NextResponse.json({ error: BTC_MISSING }, { status: 400 });
    const base: Record<string, unknown> = { ...row };
    for (const f of BTC_FIELDS) delete base[f];
    ({ error } = await ctx.admin.from("payment_settings").upsert(base, { onConflict: "id" }));
  }
  if (error) return NextResponse.json({ error: isMissingTable(error.message) ? MISSING : error.message }, { status: 500 });
  await logAudit({ actorId: ctx.me.id, actorEmail: ctx.me.email, action: "payment_settings.updated", entityType: "settings", entityId: "payment", details: { monthly: parsed.value.monthly_price, yearly: parsed.value.yearly_price, accounts: parsed.value.accounts.length, bitcoin: parsed.value.btc_enabled, btcMinutes: parsed.value.btc_quote_minutes, btcConfirmations: parsed.value.btc_confirmations } }).catch(() => {});
  return NextResponse.json({ ok: true, settings: parsed.value });
}

/** Body: { action: "add_addresses", text } or { action: "remove_address", address }. Only receiving addresses are ever stored. */
export async function POST(request: Request) {
  const ctx = await requireAdminService();
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const body = await request.json().catch(() => ({}));

  if (body.action === "add_addresses") {
    const text = typeof body.text === "string" ? body.text.slice(0, 20000) : "";
    const { valid, invalid } = parseAddresses(text);
    if (invalid.length) return NextResponse.json({ error: `These do not look like Bitcoin addresses: ${invalid.slice(0, 5).join(", ")}${invalid.length > 5 ? ` and ${invalid.length - 5} more` : ""}. Nothing was added. If one is a seed phrase or private key, do not paste it anywhere.` }, { status: 400 });
    if (!valid.length) return NextResponse.json({ error: "Paste at least one address, one per line." }, { status: 400 });
    if (valid.length > 200) return NextResponse.json({ error: "Add at most 200 addresses at a time." }, { status: 400 });
    const { count } = await ctx.admin.from("btc_addresses").select("address", { count: "exact", head: true });
    if ((count ?? 0) + valid.length > 1000) return NextResponse.json({ error: "The list can hold 1000 addresses." }, { status: 400 });
    const { data: have, error: haveErr } = await ctx.admin.from("btc_addresses").select("address").in("address", valid);
    if (haveErr) return NextResponse.json({ error: isMissingTable(haveErr.message) ? BTC_MISSING : haveErr.message }, { status: 500 });
    const known = new Set((have ?? []).map((a) => a.address as string));
    const fresh = valid.filter((a) => !known.has(a));
    if (fresh.length) {
      const { error } = await ctx.admin.from("btc_addresses").insert(fresh.map((address) => ({ address })));
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    await logAudit({ actorId: ctx.me.id, actorEmail: ctx.me.email, action: "bitcoin.addresses_added", entityType: "settings", entityId: "payment", details: { added: fresh.length, alreadyThere: valid.length - fresh.length } }).catch(() => {});
    return NextResponse.json({ ok: true, added: fresh.length, skipped: valid.length - fresh.length });
  }

  if (body.action === "remove_address") {
    const address = typeof body.address === "string" ? body.address : "";
    if (!address) return NextResponse.json({ error: "Choose an address." }, { status: 400 });
    const { data: gone, error } = await ctx.admin.from("btc_addresses").delete().eq("address", address).is("payment_id", null).select("address");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!(gone ?? []).length) return NextResponse.json({ error: "Only unused addresses can be removed." }, { status: 409 });
    await logAudit({ actorId: ctx.me.id, actorEmail: ctx.me.email, action: "bitcoin.address_removed", entityType: "settings", entityId: "payment", details: { address } }).catch(() => {});
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
