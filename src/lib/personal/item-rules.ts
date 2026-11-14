import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_SHOPPING_NAMES, shoppingSet } from "@/lib/personal/item-categories";

/** Categories that count as shopping: the built-in ones plus any the admin marked. Before the migration there is no area column: the built-in list is used. */
export async function fetchShoppingList(supabase: SupabaseClient): Promise<string[]> {
  try {
    const { data, error } = await supabase.from("grocery_categories").select("name").eq("area", "shopping").limit(100);
    const names = error ? [] : ((data ?? []) as { name: string }[]).map((d) => d.name);
    return [...new Set([...DEFAULT_SHOPPING_NAMES, ...names])];
  } catch {
    return [...DEFAULT_SHOPPING_NAMES];
  }
}

export async function fetchShoppingNames(supabase: SupabaseClient): Promise<Set<string>> {
  return shoppingSet(await fetchShoppingList(supabase));
}

/** Your own choices: this product is always this category. Before the migration there is no table: no choices yet. */
export async function fetchItemRules(supabase: SupabaseClient): Promise<Map<string, string>> {
  try {
    const { data, error } = await supabase.from("grocery_item_rules").select("normalized_name, category").limit(2000);
    if (error) return new Map();
    return new Map(((data ?? []) as { normalized_name: string; category: string }[]).map((r) => [r.normalized_name, r.category]));
  } catch {
    return new Map();
  }
}

export async function saveItemRules(supabase: SupabaseClient, userId: string, rules: { normalized_name: string; category: string }[]): Promise<void> {
  const rows = rules.filter((r) => r.normalized_name && r.category).slice(0, 200).map((r) => ({ user_id: userId, normalized_name: r.normalized_name.slice(0, 160), category: r.category.slice(0, 60), updated_at: new Date().toISOString() }));
  if (!rows.length) return;
  try { await supabase.from("grocery_item_rules").upsert(rows, { onConflict: "user_id,normalized_name" }); } catch { /* the choice is just not remembered */ }
}
