import type { SupabaseClient } from "@supabase/supabase-js";
import { RECEIPT_TYPE_COLS } from "@/lib/columns";
import { readType, STARTER_TYPES, type ReceiptType } from "@/lib/receipt-types";

export const typesKey = (userId: string) => `${userId}:receipt-types`;
const seededKey = (userId: string) => `lifolio:types-seeded:${userId}`;

/** Your receipt types. `missing` is true when migration_receipt_types.sql has not been run yet. */
export async function fetchReceiptTypes(supabase: SupabaseClient): Promise<{ data: { types: ReceiptType[]; missing: boolean } | null; error: unknown }> {
  const { data, error } = await supabase.from("receipt_types").select(RECEIPT_TYPE_COLS).order("sort_order").order("created_at").limit(100);
  if (error) {
    if (/relation|schema cache|does not exist/i.test(error.message ?? "")) return { data: { types: [], missing: true }, error: null };
    return { data: null, error };
  }
  return { data: { types: ((data ?? []) as unknown as Record<string, unknown>[]).map(readType).filter((t): t is ReceiptType => !!t), missing: false }, error: null };
}

export const wasSeeded = (userId: string) => { try { return localStorage.getItem(seededKey(userId)) === "1"; } catch { return true; } };
export const markSeeded = (userId: string) => { try { localStorage.setItem(seededKey(userId), "1"); } catch { /* ignore */ } };

/** Offers the starter types once, when you have none. */
export async function seedStarterTypes(supabase: SupabaseClient, userId: string): Promise<boolean> {
  if (wasSeeded(userId)) return false;
  markSeeded(userId);
  const { error } = await supabase.from("receipt_types").insert(STARTER_TYPES.map((t, i) => ({ ...t, sort_order: i })));
  return !error;
}

export async function saveReceiptType(supabase: SupabaseClient, row: { name: string; icon: string; color: string; show_in_budget: boolean; monthly_limit: number | null }, id?: string | null): Promise<{ id: string | null; error: string | null }> {
  if (id) {
    const { error } = await supabase.from("receipt_types").update(row).eq("id", id);
    return { id, error: error?.message ?? null };
  }
  const { data, error } = await supabase.from("receipt_types").insert(row).select("id").single();
  return { id: (data as { id: string } | null)?.id ?? null, error: error?.message ?? null };
}

/** Deleting a type keeps its receipts: they go back to Groceries first. */
export async function deleteReceiptType(supabase: SupabaseClient, id: string): Promise<string | null> {
  const moved = await supabase.from("grocery_receipts").update({ area: "groceries", type_id: null }).eq("type_id", id);
  if (moved.error) return moved.error.message;
  const { error } = await supabase.from("receipt_types").delete().eq("id", id);
  return error?.message ?? null;
}
