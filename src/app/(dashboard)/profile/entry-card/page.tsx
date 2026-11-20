"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { BackLink, PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { currentPassport } from "@/lib/documents";
import { formatDate } from "@/lib/utils";
import { DETAILS_COLS, EMPTY_DETAILS, GENDERS, cleanDetails, shortDate, validEmail, type EntryDetails } from "@/lib/entry-card";

const L = "text-sm font-medium";

export default function EntryCardDetailsPage() {
  const [d, setD] = useState<EntryDetails>(EMPTY_DETAILS);
  const [state, setState] = useState<"loading" | "ready" | "setup">("loading");
  const [expiry, setExpiry] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user.id;
      if (!uid) { setError("Sign in again to see your details."); return setState("ready"); }
      const [det, doc] = await Promise.all([
        supabase.from("entry_card_details").select(DETAILS_COLS).eq("user_id", uid).maybeSingle(),
        supabase.from("travel_documents").select("kind, expiry_date").eq("user_id", uid).eq("kind", "passport"),
      ]);
      if (det.error) {
        if (/relation|schema cache|does not exist/i.test(det.error.message)) return setState("setup");
        setError("Could not load your details. Check your connection and try again.");
      } else setD(cleanDetails(det.data));
      setExpiry(currentPassport(doc.data ?? [])?.expiry_date ?? null);
      setState("ready");
    })();
  }, []);

  const set = (k: keyof EntryDetails) => (e: { target: { value: string } }) => { setSaved(false); setD((x) => ({ ...x, [k]: e.target.value })); };

  const save = async () => {
    setError(null); setSaved(false);
    const c = cleanDetails(d);
    if (c.email && !validEmail(c.email)) return setError("Check the email address.");
    setBusy(true);
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user.id;
    if (!uid) { setBusy(false); return setError("Sign in again to save."); }
    const r = await supabase.from("entry_card_details").upsert({ user_id: uid, ...c, birth_date: c.birth_date || null, updated_at: new Date().toISOString() });
    setBusy(false);
    if (r.error) return setError("Could not save. Check your connection and try again.");
    setD(c); setSaved(true);
  };

  return (
    <div className="mx-auto w-full max-w-xl space-y-4 px-4 pb-28 pt-4">
      <BackLink href="/profile">Profile</BackLink>
      <PageHeader title="Details for entry cards" description="Saved once, used for every entry card. Private to you." />
      {state === "loading" && <p className="text-sm text-muted-foreground">Loading…</p>}
      {state === "setup" && <Alert variant="warning">This needs one database update. Ask the admin to run migration_entry_card.sql.</Alert>}
      {state === "ready" && (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <label className="block space-y-1.5"><span className={L}>Last name(s)</span><Input value={d.last_name} onChange={set("last_name")} autoComplete="family-name" className="h-12 text-base" /></label>
          <label className="block space-y-1.5"><span className={L}>First name(s)</span><Input value={d.first_name} onChange={set("first_name")} autoComplete="given-name" className="h-12 text-base" /></label>
          <label className="block space-y-1.5">
            <span className={L}>Passport number</span>
            <div className="flex gap-2">
              <Input type={show ? "text" : "password"} value={d.passport_number} onChange={set("passport_number")} autoComplete="off" className="h-12 flex-1 text-base" />
              <Button type="button" variant="outline" className="h-12" onClick={() => setShow((v) => !v)}>{show ? "Hide" : "Show"}</Button>
            </div>
            <span className="block text-xs text-muted-foreground">{expiry ? `Expiry comes from your passport in Documents: ${formatDate(expiry)}.` : "Add your passport in Documents so the expiry date is filled in."}</span>
          </label>
          <label className="block space-y-1.5"><span className={L}>Nationality</span><Input value={d.nationality} onChange={set("nationality")} className="h-12 text-base" /></label>
          <label className="block space-y-1.5"><span className={L}>Date of birth</span><Input type="date" value={d.birth_date} onChange={set("birth_date")} className="h-12 text-base" />{d.birth_date && <span className="block text-xs text-muted-foreground">{shortDate(d.birth_date)}</span>}</label>
          <label className="block space-y-1.5"><span className={L}>Gender</span><Select value={d.gender} onChange={set("gender")} className="h-12 text-base"><option value="">Choose</option>{GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}</Select></label>
          <label className="block space-y-1.5"><span className={L}>Country of birth</span><Input value={d.birth_country} onChange={set("birth_country")} className="h-12 text-base" /></label>
          <label className="block space-y-1.5"><span className={L}>Email address</span><Input type="email" value={d.email} onChange={set("email")} autoComplete="email" className="h-12 text-base" /></label>
          {error && <Alert variant="error">{error}</Alert>}
          {saved && <Alert variant="success">Saved.</Alert>}
          <Button type="submit" className="h-12 w-full" disabled={busy}><Check className="h-4 w-4" aria-hidden /> Save my details</Button>
          <p className="text-xs text-muted-foreground">Hidden until you tap Show. Included in Export my data and removed with Delete account. Never sent anywhere.</p>
        </form>
      )}
    </div>
  );
}
