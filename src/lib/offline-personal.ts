import type { SupabaseClient } from "@supabase/supabase-js";
import { PERSONAL_EXPENSE_COLS, PERSONAL_PROJECT_COLS } from "@/lib/columns";
import type { PersonalExpense, PersonalKind, PersonalProject } from "@/lib/personal/constants";

/** What the personal screens load, and the key each is kept under on the phone. Shared with the background warm-up. */

type Result<T> = Promise<{ data: T | null; error: unknown }>;

export type ProjectRow = PersonalProject & { personal_expenses: { amount_usd: number }[] };
export type ProjectBundle = { project: PersonalProject; expenses: PersonalExpense[]; linked?: LinkedSpend[] };

export const projectsKey = (userId: string, kind: PersonalKind) => `${userId}:projects:${kind}`;
export const projectKey = (userId: string, id: string) => `${userId}:project:${id}`;

export type LinkedSpend = { id: string; project_id: string; merchant: string | null; amount: number; currency: string; exchange_rate: number; amount_usd: number; category: string; expense_date: string; receipt_path: string | null };

/** Quick spends attached to home projects. Any error (the House migration is not run yet) just means none. */
export async function fetchLinkedSpends(supabase: SupabaseClient, projectId?: string): Promise<LinkedSpend[]> {
  let q = supabase.from("personal_spends").select("id, project_id, merchant, amount, currency, exchange_rate, amount_usd, category, expense_date, receipt_path").not("project_id", "is", null);
  if (projectId) q = q.eq("project_id", projectId);
  const { data, error } = await q.order("expense_date", { ascending: false }).limit(2000);
  if (error) return [];
  return ((data ?? []) as unknown as LinkedSpend[]).map((x) => ({ ...x, amount: Number(x.amount), amount_usd: Number(x.amount_usd), exchange_rate: Number(x.exchange_rate) }));
}

/** Counts attached quick spends in each project's expense list, so every total and count already shown includes them. */
export function withLinkedTotals<T extends { id?: string; personal_expenses?: { amount_usd: number | string | null }[] | null }>(projects: T[], spends: { project_id: string; amount_usd: number }[]): T[] {
  if (!spends.length) return projects;
  return projects.map((p) => {
    const mine = spends.filter((x) => x.project_id === p.id);
    return mine.length ? { ...p, personal_expenses: [...(p.personal_expenses ?? []), ...mine.map((x) => ({ amount_usd: x.amount_usd }))] } : p;
  });
}

export async function fetchProjects(supabase: SupabaseClient, kind: PersonalKind): Result<ProjectRow[]> {
  const { data, error } = await supabase
    .from("personal_projects")
    .select(`${PERSONAL_PROJECT_COLS}, personal_expenses(amount_usd)`)
    .eq("kind", kind)
    .order("created_at", { ascending: false });
  if (error) return { data: null, error };
  const rows = (data as unknown as ProjectRow[]) ?? [];
  return { data: kind === "home_project" ? withLinkedTotals(rows, await fetchLinkedSpends(supabase)) : rows, error };
}

export async function fetchProjectBundle(supabase: SupabaseClient, id: string): Result<ProjectBundle> {
  const [p, e] = await Promise.all([
    supabase.from("personal_projects").select(PERSONAL_PROJECT_COLS).eq("id", id).single(),
    supabase.from("personal_expenses").select(PERSONAL_EXPENSE_COLS).eq("project_id", id).order("expense_date", { ascending: false }),
  ]);
  if (p.error || !p.data) return { data: null, error: p.error ?? new Error("Not found") };
  if (e.error) return { data: null, error: e.error };
  const expenses = ((e.data as unknown as PersonalExpense[]) ?? []).map((x) => ({ ...x, amount: Number(x.amount), amount_usd: Number(x.amount_usd) }));
  return { data: { project: p.data as unknown as PersonalProject, expenses, linked: await fetchLinkedSpends(supabase, id) }, error: null };
}
