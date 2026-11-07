import type { SupabaseClient } from "@supabase/supabase-js";
import { PERSONAL_EXPENSE_COLS, PERSONAL_PROJECT_COLS } from "@/lib/columns";
import type { PersonalExpense, PersonalKind, PersonalProject } from "@/lib/personal/constants";

/** What the personal screens load, and the key each is kept under on the phone. Shared with the background warm-up. */

type Result<T> = Promise<{ data: T | null; error: unknown }>;

export type ProjectRow = PersonalProject & { personal_expenses: { amount_usd: number }[] };
export type ProjectBundle = { project: PersonalProject; expenses: PersonalExpense[] };

export const projectsKey = (userId: string, kind: PersonalKind) => `${userId}:projects:${kind}`;
export const projectKey = (userId: string, id: string) => `${userId}:project:${id}`;

export async function fetchProjects(supabase: SupabaseClient, kind: PersonalKind): Result<ProjectRow[]> {
  const { data, error } = await supabase
    .from("personal_projects")
    .select(`${PERSONAL_PROJECT_COLS}, personal_expenses(amount_usd)`)
    .eq("kind", kind)
    .order("created_at", { ascending: false });
  return { data: error ? null : ((data as unknown as ProjectRow[]) ?? []), error };
}

export async function fetchProjectBundle(supabase: SupabaseClient, id: string): Result<ProjectBundle> {
  const [p, e] = await Promise.all([
    supabase.from("personal_projects").select(PERSONAL_PROJECT_COLS).eq("id", id).single(),
    supabase.from("personal_expenses").select(PERSONAL_EXPENSE_COLS).eq("project_id", id).order("expense_date", { ascending: false }),
  ]);
  if (p.error || !p.data) return { data: null, error: p.error ?? new Error("Not found") };
  if (e.error) return { data: null, error: e.error };
  const expenses = ((e.data as unknown as PersonalExpense[]) ?? []).map((x) => ({ ...x, amount: Number(x.amount), amount_usd: Number(x.amount_usd) }));
  return { data: { project: p.data as unknown as PersonalProject, expenses }, error: null };
}
