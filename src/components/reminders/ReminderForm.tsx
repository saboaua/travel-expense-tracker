"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera, Crown, Loader2, Lock, Users, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { useLimits } from "@/lib/use-limits";
import { DAY_LETTERS, DAY_ORDER, alignToDays, cleanDays, daysText, normalizeReminder, ALERTS, EVERYDAY_ICONS, HOUSE_ICONS, PHOTO_LIMIT, REMINDER_COLORS, REPEATS, quickWhen, toInput, type AlertWhen, type Reminder, type Repeat } from "@/lib/reminders";
import { ReminderBadge, iconFor } from "./reminder-icons";
import { REMINDER_COLS, setupMessage } from "./RemindersList";
import { ShareSheet } from "./ShareSheet";
import { usePhotos, type Photo } from "./use-photos";

const chip = (on: boolean) => `min-h-10 rounded-full border px-3.5 text-sm font-medium ${on ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`;
const label = "mb-1.5 block text-sm font-semibold";

/** One form for a new reminder and for editing one. Photos are saved when you save. */
export function ReminderForm({ id }: { id?: string }) {
  const router = useRouter();
  const lim = useLimits();
  const pro = !!lim?.who.pro;
  const max = pro ? PHOTO_LIMIT.pro : PHOTO_LIMIT.free;
  const [loaded, setLoaded] = useState(!id);
  const [r, setR] = useState<Reminder | null>(null);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [due, setDue] = useState(() => toInput(quickWhen(new Date()).tomorrow));
  const [repeat, setRepeat] = useState<Repeat>("none");
  const [days, setDays] = useState<number[]>([]);
  const [alert, setAlert] = useState<AlertWhen>("at");
  const [color, setColor] = useState("blue");
  const [icon, setIcon] = useState<string>("bell");
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [share, setShare] = useState(false);
  const photos = usePhotos(id ?? null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data, error: e } = await createClient().from("reminders").select(REMINDER_COLS).eq("id", id).maybeSingle();
      if (e) setError(setupMessage(e.message));
      const row = data ? normalizeReminder(data as Reminder) : null;
      if (row) {
        setR(row); setTitle(row.title); setNotes(row.notes ?? ""); setDue(toInput(new Date(row.snoozed_until ?? row.due_at)));
        setRepeat(row.repeat); setDays(row.repeat_days ?? []); setAlert(row.alert); setColor(row.color); setIcon(row.icon);
      }
      setLoaded(true);
    })();
  }, [id]);

  const q = quickWhen(new Date());
  const setChip = (d: Date | null) => { if (d) { setDue(toInput(d)); setPicking(false); } };
  const isChip = (d: Date | null) => !!d && due === toInput(d);
  const custom = !isChip(q.today) && !isChip(q.tomorrow) && !isChip(q.weekend);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return setError("Give the reminder a name.");
    const when = new Date(due);
    if (Number.isNaN(+when)) return setError("Choose a day and time.");
    setSaving(true); setError(null);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Please sign in again.");
      const chosen = repeat === "weekly" ? (cleanDays(days) ?? [when.getDay()]) : null;
      const first = chosen ? alignToDays(when, chosen) : when;
      const body = { title: t.slice(0, 120), notes: notes.trim() || null, due_at: first.toISOString(), repeat, repeat_days: chosen, tz: Intl.DateTimeFormat().resolvedOptions().timeZone || null, alert, color, icon, snoozed_until: null, last_alerted_for: null };
      let rid = id;
      if (rid) {
        const res = await supabase.from("reminders").update(body).eq("id", rid);
        if (res.error) throw new Error(setupMessage(res.error.message));
      } else {
        rid = crypto.randomUUID();
        const res = await supabase.from("reminders").insert({ id: rid, user_id: session.user.id, ...body });
        if (res.error) throw new Error(setupMessage(res.error.message));
      }
      const failed = await photos.commit(rid, session.user.id);
      if (failed) { setError(`Saved, but ${failed} photo${failed === 1 ? "" : "s"} could not be added.`); setSaving(false); return; }
      router.push(`/personal/reminders/${rid}`);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save."); setSaving(false); }
  }

  if (!loaded) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (id && !r) return <p className="text-sm text-muted-foreground" data-testid="reminder-missing">This reminder was not found.</p>;
  const owner = !r || r.user_id === lim?.uid || !lim;
  if (r && !owner) return <p className="text-sm text-muted-foreground">Only the person who made this reminder can edit it.</p>;

  return (
    <form onSubmit={save} className="space-y-5" data-testid="reminder-form">
      <div className="flex items-center gap-3">
        <ReminderBadge icon={icon} color={color} size="lg" />
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What do you need to remember?" aria-label="Title" maxLength={120} data-testid="reminder-title" autoFocus={!id}
          className="h-12 min-w-0 flex-1 border-b bg-transparent text-lg font-semibold outline-none placeholder:font-normal placeholder:text-muted-foreground focus:border-primary" />
      </div>
      <div>
        <label className={label} htmlFor="rm-notes">Notes</label>
        <textarea id="rm-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={2000} placeholder="Anything else to remember" data-testid="reminder-notes"
          className="w-full rounded-lg border border-input bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
      </div>

      <div>
        <span className={label}>When</span>
        <div className="flex flex-wrap gap-2">
          {q.today && <button type="button" className={chip(isChip(q.today))} onClick={() => setChip(q.today)}>Today 6 PM</button>}
          <button type="button" className={chip(isChip(q.tomorrow))} onClick={() => setChip(q.tomorrow)}>Tomorrow 9 AM</button>
          <button type="button" className={chip(isChip(q.weekend))} onClick={() => setChip(q.weekend)}>Weekend</button>
          <button type="button" className={chip(picking || custom)} onClick={() => setPicking(true)} data-testid="reminder-pick-date">Pick date</button>
        </div>
        {(picking || custom) && <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Date and time" data-testid="reminder-due" className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm" />}
      </div>

      <div>
        <span className={label}>Repeat</span>
        <div className="flex flex-wrap gap-2">{REPEATS.map((o) => <button key={o.id} type="button" className={chip(repeat === o.id)} onClick={() => { setRepeat(o.id); if (o.id === "weekly" && !days.length) setDays([new Date(due).getDay()]); }} data-testid={`repeat-${o.id}`}>{o.label}</button>)}</div>
        {repeat === "weekly" && (
          <div className="mt-3" data-testid="repeat-days">
            <span className="mb-1.5 block text-sm font-semibold">Repeat on</span>
            <div className="flex justify-between" role="group" aria-label="Repeat on">
              {DAY_ORDER.map((n) => { const on = days.includes(n); return (
                <button key={n} type="button" aria-pressed={on} aria-label={["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][n]} data-testid={`day-${n}`}
                  onClick={() => setDays((d) => (d.includes(n) ? (d.length > 1 ? d.filter((x) => x !== n) : d) : [...d, n]))}
                  className={`flex h-10 w-10 items-center justify-center rounded-full border text-sm font-bold ${on ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}>{DAY_LETTERS[n]}</button>
              ); })}
            </div>
            <div className="mt-1 flex gap-4 text-[13px] font-bold text-primary">
              <button type="button" className="min-h-11" onClick={() => setDays([1, 2, 3, 4, 5])}>Weekdays</button>
              <button type="button" className="min-h-11" onClick={() => setDays([6, 0])}>Weekends</button>
              <button type="button" className="min-h-11" onClick={() => setDays([0, 1, 2, 3, 4, 5, 6])}>Every day</button>
            </div>
            <p className="mt-1 rounded-lg bg-primary/10 px-3 py-2 text-[13.5px] font-semibold" data-testid="repeat-days-text">{daysText(days.length ? days : [new Date(due).getDay()])} at {new Date(due).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</p>
          </div>
        )}
      </div>
      <div>
        <span className={label}>Remind me</span>
        <div className="flex flex-wrap gap-2">{ALERTS.map((o) => <button key={o.id} type="button" className={chip(alert === o.id)} onClick={() => setAlert(o.id)}>{o.label}</button>)}</div>
      </div>

      <div>
        <span className={label}>Colour</span>
        <div className="flex flex-wrap gap-2.5" role="radiogroup" aria-label="Colour">
          {REMINDER_COLORS.map((c) => (
            <button key={c.id} type="button" role="radio" aria-checked={color === c.id} aria-label={c.id} onClick={() => setColor(c.id)} style={{ backgroundColor: c.hex }}
              className={`h-11 w-11 rounded-full ring-offset-2 ring-offset-background ${color === c.id ? "ring-2 ring-foreground" : ""}`} />
          ))}
        </div>
      </div>
      <div>
        <span className={label}>Icon</span>
        {([["Everyday", EVERYDAY_ICONS], ["Around the house", HOUSE_ICONS]] as const).map(([cap, set]) => (
          <div key={cap} className="mb-2.5">
            <p className="mb-1.5 text-xs font-semibold text-muted-foreground">{cap}</p>
            <div className="grid grid-cols-6 gap-2" role="radiogroup" aria-label={`${cap} icons`}>
              {set.map((n) => { const I = iconFor(n); return (
                <button key={n} type="button" role="radio" aria-checked={icon === n} aria-label={n} data-testid={`icon-${n}`} onClick={() => setIcon(n)} className={`flex h-11 items-center justify-center rounded-xl border ${icon === n ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}><I className="h-5 w-5" /></button>
              ); })}
            </div>
          </div>
        ))}
      </div>

      <div>
        <span className={label}>Photos <span className="font-normal text-muted-foreground">({photos.items.length}/{max}{pro ? "" : " on Free"})</span></span>
        <div className="flex flex-wrap gap-2">
          {photos.items.map((p: Photo) => (
            <div key={p.key} className="relative h-20 w-20 overflow-hidden rounded-xl border bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {p.url ? <img src={p.url} alt="" className="h-full w-full object-cover" /> : <Loader2 className="m-7 h-6 w-6 animate-spin text-muted-foreground" />}
              <button type="button" onClick={() => photos.remove(p)} aria-label="Remove photo" className="absolute right-0.5 top-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white"><X className="h-3.5 w-3.5" /></button>
            </div>
          ))}
          {photos.items.length < max && (
            <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed text-xs text-muted-foreground hover:bg-muted">
              <Camera className="h-5 w-5" aria-hidden="true" />Add
              <input type="file" accept="image/*" multiple className="sr-only" data-testid="reminder-photo" onChange={(e) => { photos.add(Array.from(e.target.files ?? []), max); e.target.value = ""; }} />
            </label>
          )}
        </div>
        {photos.error && <p className="mt-1.5 text-xs text-red-600">{photos.error}</p>}
        {!pro && photos.items.length >= max && <p className="mt-1.5 text-xs text-muted-foreground">Free keeps {PHOTO_LIMIT.free} photos per reminder. <Link href="/personal/pro" className="font-semibold text-primary">Pro keeps {PHOTO_LIMIT.pro}</Link>.</p>}
      </div>

      <div>
        <span className={label}>Share</span>
        {!id ? (
          <p className="rounded-xl border p-3 text-sm text-muted-foreground">{pro ? "Save the reminder first, then share it from its page." : <><Lock className="mr-1.5 inline h-4 w-4" aria-hidden="true" />Sharing a reminder is a Pro feature.</>}</p>
        ) : (
          <button type="button" onClick={() => setShare(true)} data-testid="reminder-share" className="flex min-h-12 w-full items-center gap-3 rounded-xl border px-3 text-left hover:bg-muted">
            <Users className="h-5 w-5 text-muted-foreground" aria-hidden="true" /><span className="flex-1 text-sm font-medium">Share with someone</span>
            {pro ? null : <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900"><Crown className="h-3 w-3" aria-hidden="true" />Pro</span>}
          </button>
        )}
      </div>

      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200" data-testid="reminder-error">{error}</p>}
      <div className="flex gap-3">
        <Button type="button" variant="outline" className="flex-1" onClick={() => router.back()}>Cancel</Button>
        <Button type="submit" className="flex-1" disabled={saving} data-testid="reminder-save">{saving ? "Saving…" : id ? "Save changes" : "Add reminder"}</Button>
      </div>
      {share && id && <ShareSheet reminderId={id} pro={pro} onClose={() => setShare(false)} />}
    </form>
  );
}
