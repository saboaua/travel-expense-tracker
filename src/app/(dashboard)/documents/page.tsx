import { BackLink } from "@/components/ui/page-header";
import Link from "next/link";
import { loadPermissions } from "@/lib/access-server";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/session";
import { DocumentsManager } from "@/components/documents/DocumentsManager";
import { kindLabel, type TravelDocument } from "@/lib/documents";
import { DOCUMENT_COLS, DOCUMENT_COLS_BASE, DOCUMENT_COLS_NUMBER, withColumnFallback3 } from "@/lib/columns";

export default async function DocumentsPage() {
  const supabase = await createClient();
  const user = await getCurrentUser();
  // Failsafe: the middleware already sends signed-out visitors away; if one ever got here, never run a query without an owner
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user?.id).single();
  const canSeePersonal = (await loadPermissions(supabase, (profile?.role as string) || "user")).has("personal");
  const { data } = await withColumnFallback3(
    (cols) => supabase.from("travel_documents").select(cols).eq("user_id", user?.id).order("created_at", { ascending: false }),
    DOCUMENT_COLS,
    DOCUMENT_COLS_NUMBER,
    DOCUMENT_COLS_BASE
  );
  const all = (data || []) as unknown as TravelDocument[];

  const tripDocs = all.filter((d) => d.trip_id);
  const tripIds = [...new Set(tripDocs.map((d) => d.trip_id as string))];
  const { data: trips } = tripIds.length ? await supabase.from("trips").select("id, name").in("id", tripIds) : { data: [] as { id: string; name: string }[] };
  const nameOf = new Map((trips || []).map((t) => [t.id, t.name]));

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 pb-28 md:p-8">
      {canSeePersonal && (
        <BackLink href="/personal">Personal</BackLink>
      )}
      <DocumentsManager defaultKind="passport" />

      {tripDocs.length > 0 && (
        <section className="rounded-xl border bg-card p-5 shadow-sm">
          <h2 className="mb-3 text-base font-semibold">Trip documents</h2>
          <ul className="divide-y">
            {tripDocs.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 truncate">{d.title} <span className="text-muted-foreground">· {kindLabel(d.kind)}</span></span>
                <Link href={`/trips/${d.trip_id}`} className="shrink-0 text-primary hover:underline">{nameOf.get(d.trip_id as string) || "Trip"}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
