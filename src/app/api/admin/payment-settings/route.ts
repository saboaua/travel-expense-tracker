import { NextResponse } from "next/server";
import { requireAdminService, isMissingTable } from "@/lib/admin-roles-api";
import { logAudit } from "@/lib/audit";
import { isMissingColumn } from "@/lib/columns";
import { createHash } from "node:crypto";
import { parseAddresses } from "@/lib/bitcoin-address";
import { parseExtendedKey, previewAddresses, XPUB_TYPE_LABEL, type XpubType } from "@/lib/bitcoin-xpub";
import { EMPTY_SETTINGS, PAYMENT_BASE_SETTINGS_COLS, PAYMENT_SETTINGS_COLS, parseSettings } from "@/lib/payments";

export const dynamic = "force-dynamic";
const MISSING = "Payments are not set up yet. Run supabase/migration_pro_payments.sql in the Supabase SQL Editor.";
const BTC_MISSING = "Bitcoin is not set up yet. Run supabase/migration_pro_bitcoin.sql in the Supabase SQL Editor.";
const fingerprint = (xpub: string) => createHash("sha256").update(xpub).digest("hex");
const isXpubType = (v: unknown): v is XpubType => v === "legacy" || v === "segwit" || v === "native";
const BTC_FIELDS = ["btc_enabled", "btc_quote_minutes", "btc_confirmations"] as const;

export async function GET() {
  const ctx = await requireAdminService();
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  let res = await ctx.admin.from("payment_settings").select(PAYMENT_SETTINGS_COLS).eq("id", 1).maybeSingle();
  if (isMissingColumn(res.error)) res = (await ctx.admin.from("payment_settings").select(PAYMENT_BASE_SETTINGS_COLS).eq("id", 1).maybeSingle()) as typeof res;
  const { data, error } = res;
  if (error) return NextResponse.json({ error: isMissingTable(error.message) ? MISSING : error.message, setupNeeded: isMissingTable(error.message) }, { status: isMissingTable(error.message) ? 200 : 500 });
  let pool = await ctx.admin.from("btc_addresses").select("address, payment_id").is("derive_index", null).order("created_at", { ascending: true }).limit(500);
  if (isMissingColumn(pool.error)) pool = (await ctx.admin.from("btc_addresses").select("address, payment_id").order("created_at", { ascending: true }).limit(500)) as typeof pool;
  const bitcoinSetup = !pool.error;
  const addresses = (pool.data ?? []).map((a) => ({ address: a.address as string, used: !!a.payment_id }));
  // The wallet key is only ever sent to an admin
  const w = await ctx.admin.from("btc_wallet").select("xpub, xpub_type, next_index").eq("id", 1).maybeSingle();
  const walletSetup = !w.error;
  const wallet = w.data?.xpub ? { xpub: w.data.xpub as string, type: w.data.xpub_type as XpubType, nextIndex: Number(w.data.next_index) || 0 } : null;
  return NextResponse.json({ settings: { ...EMPTY_SETTINGS, ...((data ?? {}) as object) }, bitcoinSetup, addresses, walletSetup, wallet });
}

export async function PUT(request: Request) {
  const ctx = await requireAdminService();
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const body = await request.json().catch(() => ({}));
  const parsed = parseSettings(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const walletResult = await saveWallet(ctx, body, parsed.value.btc_enabled);
  if (walletResult.error) return NextResponse.json({ error: walletResult.error }, { status: 400 });
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

type Ctx = Exclude<Awaited<ReturnType<typeof requireAdminService>>, { error: string }>;

/** Save or clear the wallet key when the form sent one. A new key needs the admin to say the first addresses match their wallet. */
async function saveWallet(ctx: Ctx, body: Record<string, unknown>, enabled: boolean): Promise<{ error?: string }> {
  if (typeof body.btc_xpub !== "string") return {};
  const text = body.btc_xpub.trim();
  const now = new Date().toISOString();
  const { data: cur, error: curErr } = await ctx.admin.from("btc_wallet").select("xpub, xpub_type, xpub_fp, next_index").eq("id", 1).maybeSingle();
  if (curErr) return text || enabled ? { error: BTC_MISSING } : {};
  if (!text) {
    if (cur?.xpub) { await ctx.admin.from("btc_wallet").update({ xpub: null, updated_at: now }).eq("id", 1); await logAudit({ actorId: ctx.me.id, actorEmail: ctx.me.email, action: "bitcoin.xpub_removed", entityType: "settings", entityId: "payment", details: {} }).catch(() => {}); }
    return {};
  }
  const type = isXpubType(body.btc_xpub_type) ? body.btc_xpub_type : undefined;
  const key = parseExtendedKey(text, type);
  if (!key.ok) return { error: key.error };
  if (cur?.xpub === text && cur.xpub_type === key.type) return {};
  if (body.btc_xpub_match !== true) return { error: "Check the key and confirm that the first addresses match your wallet before you save." };
  const fp = fingerprint(text);
  const sameKeyAsBefore = cur?.xpub_fp === fp;
  // A different key starts again at address 0; the old addresses stay in the ledger as history
  if (!sameKeyAsBefore) await ctx.admin.from("btc_addresses").update({ derive_index: null }).gte("derive_index", 0);
  const { error } = await ctx.admin.from("btc_wallet").upsert({ id: 1, xpub: text, xpub_type: key.type, xpub_fp: fp, next_index: sameKeyAsBefore ? Number(cur?.next_index) || 0 : 0, updated_at: now }, { onConflict: "id" });
  if (error) return { error: isMissingTable(error.message) ? BTC_MISSING : error.message };
  await logAudit({ actorId: ctx.me.id, actorEmail: ctx.me.email, action: "bitcoin.xpub_set", entityType: "settings", entityId: "payment", details: { kind: key.prefix, type: key.type, fingerprint: fp.slice(0, 8) } }).catch(() => {});
  return {};
}

/** Body: { action: "add_addresses", text } or { action: "remove_address", address }. Only receiving addresses are ever stored. */
export async function POST(request: Request) {
  const ctx = await requireAdminService();
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const body = await request.json().catch(() => ({}));

  if (body.action === "check_xpub") {
    const key = parseExtendedKey(typeof body.xpub === "string" ? body.xpub : "", isXpubType(body.type) ? body.type : undefined);
    if (!key.ok) return NextResponse.json({ error: key.error }, { status: 400 });
    try { return NextResponse.json({ ok: true, prefix: key.prefix, type: key.type, label: XPUB_TYPE_LABEL[key.type], addresses: previewAddresses(key.key, key.type, 2) }); }
    catch { return NextResponse.json({ error: "Could not make addresses from that key." }, { status: 400 }); }
  }

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
