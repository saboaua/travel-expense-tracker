import Link from "next/link";
import { ArrowLeft, FileText, ShieldCheck } from "lucide-react";
import { loadPermissions } from "@/lib/access-server";
import { createClient } from "@/lib/supabase/server";
import { DocumentsManager } from "@/components/documents/DocumentsManager";
import { currentPassport, kindLabel, passportStatus, type TravelDocument } from "@/lib/documents";
import { formatDate, todayISO } from "@/lib/utils";

const BADGE = { expired: "bg-red-100 text-red-700", critical: "bg-red-100 text-red-700", renew: "bg-amber-100 text-amber-800", ok: "bg-emerald-100 text-emerald-700" } as const;

export default async function DocumentsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user?.id).single();
  const canSeePersonal = (await loadPermissions(supabase, (profile?.role as string) || "user")).has("personal");
  const { data } = await supabase.from("travel_documents").select("*").eq("user_id", user?.id).order("created_at", { ascending: false });
  const all = (data || []) as TravelDocument[];
  const passport = currentPassport(all);
  const status = passport?.expiry_date ? passportStatus(passport.expiry_date, todayISO()) : null;

  const tripDocs = all.filter((d) => d.trip_id);
  const tripIds = [...new Set(tripDocs.map((d) => d.trip_id as string))];
  const { data: trips } = tripIds.length ? await supabase.from("trips").select("id, name").in("id", tripIds) : { data: [] as { id: string; name: string }[] };
  const nameOf = new Map((trips || []).map((t) => [t.id, t.name]));

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 pb-24 md:p-8">
      <div>
        {canSeePersonal && (
          <Link href="/personal" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Personal
          </Link>
        )}
        <h1 className="flex items-center gap-2 text-2xl font-bold md:text-3xl"><FileText className="h-7 w-7" /> Documents</h1>
        <p className="mt-1 text-muted-foreground">Your passport and travel papers, close at hand.</p>
      </div>

      <section className="rounded-2xl border bg-card p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold">Passport</h2>
          {status && <span className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-medium ${BADGE[status.level]}`}>{status.title}</span>}
        </div>
        {passport && status ? (
          <p className="mb-4 text-sm text-muted-foreground">
            Expires <strong className="text-foreground">{formatDate(passport.expiry_date as string)}</strong>
            {status.daysLeft >= 0 ? ` (${status.daysLeft} days)` : ""}. {status.level === "ok" ? `Start renewing around ${formatDate(status.renewBy)}.` : status.message}
          </p>
        ) : (
          <p className="mb-4 text-sm text-muted-foreground">Add your passport and we will remind you when to renew. Most destinations want it valid for 6+ months beyond your trip.</p>
        )}
        <DocumentsManager defaultKind="passport" />
      </section>

      {tripDocs.length > 0 && (
        <section className="rounded-2xl border bg-card p-5 shadow-sm">
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
