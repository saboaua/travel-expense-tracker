"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Check, Loader2, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { makeRowApi, saveRow } from "@/lib/row-outbox";
import { browserOutbox } from "@/lib/outbox";
import { compressReceiptImage } from "@/lib/compress-image";
import {
  FLIGHT_LEGS, clock, isIsoDay, manualFlight, parseFlightNumber, sanitizeFlightScan,
  type FlightFields, type FlightLeg, type FlightScan, type TripFlight,
} from "@/lib/flights";

const input = "min-h-12 w-full rounded-xl border border-input bg-background px-3.5 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
const label = "mb-1.5 block text-sm font-semibold";
const CABINS = ["Economy", "Premium Economy", "Business", "First"];

function Segmented<T extends string>({ value, options, onChange, name }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; name: string }) {
  return (
    <div role="group" aria-label={name} className="flex gap-1 rounded-2xl bg-muted p-1">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn("min-h-11 flex-1 rounded-xl px-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary", value === o.id ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function FoundCard({ f }: { f: FlightFields }) {
  const d = clock(f.dep_local);
  const a = clock(f.arr_local);
  const day = (iso: string | null) => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "");
  return (
    <div className="rounded-2xl border-2 border-emerald-600 bg-emerald-50 p-3.5 dark:bg-emerald-950/30" data-testid="flight-found">
      <p className="flex items-center gap-2 text-sm font-bold text-emerald-900 dark:text-emerald-200"><Check className="h-[18px] w-[18px]" aria-hidden="true" />Flight found</p>
      <p className="mt-2 text-[15px] font-semibold">{[f.airline, f.flight_number].filter(Boolean).join(" · ")}</p>
      {f.aircraft && <p className="text-[13px] text-muted-foreground">{f.aircraft}</p>}
      <div className="mt-3 flex justify-between gap-3 text-[15px]">
        <span><b>{f.dep_iata}</b> {d && `${d.time} ${d.period}`}<br /><span className="text-[13px] text-muted-foreground">{[f.dep_city, day(f.dep_local)].filter(Boolean).join(" · ")}</span></span>
        <span className="text-right"><b>{f.arr_iata}</b> {a && `${a.time} ${a.period}`}<br /><span className="text-[13px] text-muted-foreground">{[f.arr_city, day(f.arr_local)].filter(Boolean).join(" · ")}</span></span>
      </div>
    </div>
  );
}

type Notice = { tone: "info" | "warn"; text: string } | null;

/**
 * Add or edit a flight on a trip. Find it by number and date (the service fills in the rest), scan a ticket or boarding
 * pass, or enter it by hand. Bottom sheet on phones, centred dialog on larger screens.
 */
export function AddFlightSheet({
  tripId, tripName, tripStart, tripEnd, userId, existing, defaultLeg, tripWaiting, onClose, onSaved,
}: {
  tripId: string;
  tripName: string;
  tripStart: string;
  tripEnd: string;
  userId: string;
  existing?: TripFlight | null;
  defaultLeg?: FlightLeg;
  /** The trip itself has not reached the server yet, so the flight waits for it */
  tripWaiting?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = !!existing;
  const [leg, setLeg] = useState<FlightLeg>(existing?.leg ?? defaultLeg ?? "outbound");
  const [mode, setMode] = useState<"find" | "manual">(existing?.source === "manual" ? "manual" : "find");
  const [number, setNumber] = useState(existing?.flight_number ?? "");
  const [date, setDate] = useState(existing?.flight_date ?? tripStart);
  const [found, setFound] = useState<FlightFields | null>(existing?.source === "auto" ? existing : null);
  const [busy, setBusy] = useState<"" | "find" | "scan" | "save">("");
  const [notice, setNotice] = useState<Notice>(null);
  const [error, setError] = useState("");
  const [pnr, setPnr] = useState(existing?.pnr ?? "");
  const [seat, setSeat] = useState(existing?.seat ?? "");
  const [cabin, setCabin] = useState(existing?.cabin ?? "");
  const [alerts, setAlerts] = useState(existing?.alerts ?? true);
  // by hand
  const [airline, setAirline] = useState(existing?.airline ?? "");
  const [from, setFrom] = useState(existing?.dep_iata ?? "");
  const [to, setTo] = useState(existing?.arr_iata ?? "");
  const [depTime, setDepTime] = useState(existing?.dep_local?.slice(11, 16) ?? "");
  const [arrTime, setArrTime] = useState(existing?.arr_local?.slice(11, 16) ?? "");
  const [arrDate, setArrDate] = useState(existing?.arr_local?.slice(0, 10) ?? "");
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  // A return flight starts from the trip's last day
  const pickLeg = (l: FlightLeg) => {
    setLeg(l);
    if (!editing && !found) setDate(l === "return" ? tripEnd : tripStart);
  };

  async function find(n = number, d = date): Promise<boolean> {
    setError("");
    setNotice(null);
    if (!parseFlightNumber(n)) { setError("Enter the flight number, like CM 312."); return false; }
    if (!isIsoDay(d)) { setError("Choose the flight date."); return false; }
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setMode("manual");
      setNotice({ tone: "warn", text: "You are offline, so the flight cannot be looked up. Enter the details yourself; they are saved when you are back online." });
      return false;
    }
    setBusy("find");
    try {
      const res = await fetch(`/api/flights/lookup?number=${encodeURIComponent(n)}&date=${encodeURIComponent(d)}`);
      const body = (await res.json().catch(() => ({}))) as { flight?: FlightFields; reason?: string; error?: string };
      if (res.ok && body.flight) { setFound(body.flight); setNumber(body.flight.flight_number); return true; }
      setFound(null);
      const pretty = parseFlightNumber(n)?.display ?? n;
      if (body.reason === "not_configured") setNotice({ tone: "info", text: "Flight lookup is not set up yet. Enter the details yourself." });
      else if (body.reason === "not_found") setNotice({ tone: "warn", text: `We couldn't find ${pretty} on that date. Check the number and date, or enter the details yourself. Flights added by hand don't update automatically.` });
      else if (body.reason === "limit") setNotice({ tone: "warn", text: "Too many lookups this hour. Enter the details yourself, or try again later." });
      else if (res.status === 400) setError(body.error || "Check the flight number and date.");
      else setNotice({ tone: "warn", text: "The flight service did not answer. Try again, or enter the details yourself." });
      if (res.status !== 400 && res.status !== 429 && body.reason !== "upstream") setMode("manual");
      return false;
    } catch {
      setNotice({ tone: "warn", text: "Could not reach the flight service. Try again, or enter the details yourself." });
      return false;
    } finally {
      setBusy("");
    }
  }

  async function scan(file: File) {
    setError("");
    setNotice(null);
    setBusy("scan");
    try {
      let image = file;
      if (file.size > 1.5 * 1024 * 1024) image = await compressReceiptImage(file, { maxSide: 2000, quality: 0.85 }).catch(() => file);
      const form = new FormData();
      form.append("file", image);
      form.append("mode", "flight");
      const res = await fetch("/api/ocr", { method: "POST", body: form });
      if (res.status === 503) { setNotice({ tone: "info", text: "Ticket scanning is not set up yet. Type the flight number instead." }); return; }
      if (!res.ok) { setNotice({ tone: "warn", text: "Could not read that picture. Try a sharper photo, or type the flight number." }); return; }
      const { result } = (await res.json()) as { result?: FlightScan };
      const s = sanitizeFlightScan(result ?? {}, "");
      if (!s.flight_number && !s.pnr && !s.seat) { setNotice({ tone: "warn", text: "No flight details found in that picture. Try a sharper photo, or type the flight number." }); return; }
      if (s.pnr) setPnr(s.pnr);
      if (s.seat) setSeat(s.seat);
      if (s.cabin) setCabin(CABINS.find((c) => c.toLowerCase() === s.cabin!.toLowerCase()) ?? s.cabin);
      if (s.dep_iata) setFrom(s.dep_iata);
      if (s.arr_iata) setTo(s.arr_iata);
      const d = s.flight_date ?? date;
      if (s.flight_date) setDate(s.flight_date);
      if (s.flight_number) {
        setNumber(s.flight_number);
        setMode("find");
        setNotice({ tone: "info", text: "Read from your picture. Check the details before saving." });
        busyAfterScan(s.flight_number, d);
      }
    } catch {
      setNotice({ tone: "warn", text: "Could not read that picture. Try again, or type the flight number." });
    } finally {
      setBusy("");
    }
  }
  // The lookup after a scan runs once the scan has finished (so its own busy state is shown)
  function busyAfterScan(n: string, d: string) {
    setTimeout(() => { void find(n, d); }, 0);
  }

  async function save() {
    setError("");
    let fields: FlightFields | null = null;
    let source: "auto" | "manual" = "manual";
    if (mode === "find" && found) {
      fields = found;
      source = "auto";
    } else if (mode === "manual") {
      const m = manualFlight({ flight_number: number, airline, flight_date: date, dep_iata: from, arr_iata: to, dep_time: depTime, arr_time: arrTime, arr_date: arrDate || undefined });
      if (!m.ok) { setError(m.error); return; }
      fields = m.fields;
    } else {
      setError("Tap Find flight first, or enter the details yourself.");
      return;
    }
    const booking = {
      leg,
      pnr: pnr.trim() ? pnr.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10) : null,
      seat: seat.trim() ? seat.trim().toUpperCase().slice(0, 4) : null,
      cabin: cabin.trim() ? cabin.trim().slice(0, 30) : null,
      alerts,
    };
    setBusy("save");
    try {
      const supabase = createClient();
      const waiting = await browserOutbox.list().catch(() => []);
      const row = editing && existing!.source === "auto" ? { ...booking } : { ...fields, ...booking, source, ...(source === "auto" ? { last_synced_at: new Date().toISOString() } : {}) };
      await saveRow({
        api: makeRowApi(supabase), store: browserOutbox, userId, table: "trip_flights", id: existing?.id,
        row: editing ? row : { trip_id: tripId, user_id: userId, ...row },
        dependsOn: tripWaiting || waiting.some((i) => i.id === tripId) ? [tripId] : undefined,
        waiting: existing ? waiting.find((i) => i.id === existing.id) ?? null : null,
        label: editing ? "Flight updated" : "Flight added", summary: `Flight · ${fields.flight_number}`,
      });
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the flight.");
      setBusy("");
    }
  }

  const autoEdit = editing && existing!.source === "auto";
  const showBooking = autoEdit || found || mode === "manual";

  return (
    <div className="app-frame fixed inset-0 z-[60] flex items-end justify-center bg-black/50 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={editing ? "Edit flight" : "Add flight"} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex max-h-[94%] w-full max-w-lg flex-col rounded-t-3xl bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl sm:rounded-2xl sm:p-6">
        <div className="mx-auto mb-2 h-1.5 w-11 rounded-full bg-muted sm:hidden" aria-hidden="true" />
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-bold">{editing ? "Edit flight" : "Add flight"}</h2>
            <p className="truncate text-sm text-muted-foreground">{tripName}</p>
          </div>
          <button type="button" onClick={onClose} className="-mr-2 -mt-1 flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label="Close">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-1">
          <Segmented name="Which flight" value={leg} options={FLIGHT_LEGS} onChange={pickLeg} />

          {notice && (
            <p role="status" data-testid="flight-notice" className={cn("rounded-xl border p-3 text-sm leading-snug", notice.tone === "warn" ? "border-amber-400 bg-amber-50 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100" : "border-blue-300 bg-blue-50 text-blue-950 dark:bg-blue-950/40 dark:text-blue-100")}>{notice.text}</p>
          )}

          {!autoEdit && (
            <>
              <div className="grid grid-cols-[1.1fr_1fr] gap-3">
                <label>
                  <span className={label}>Flight number</span>
                  <input data-testid="flight-number" className={input} value={number} onChange={(e) => { setNumber(e.target.value); setFound(null); }} placeholder="CM 312" autoCapitalize="characters" autoComplete="off" enterKeyHint="search" onKeyDown={(e) => { if (e.key === "Enter" && mode === "find") { e.preventDefault(); void find(); } }} />
                </label>
                <label>
                  <span className={label}>Date</span>
                  <input data-testid="flight-date" type="date" className={input} value={date} onChange={(e) => { setDate(e.target.value); setFound(null); }} />
                </label>
              </div>
              {mode === "find" && (
                <>
                  <button type="button" data-testid="flight-find" onClick={() => find()} disabled={busy !== ""} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary/10 text-[15px] font-semibold text-primary hover:bg-primary/15 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                    {busy === "find" ? <Loader2 className="h-[18px] w-[18px] animate-spin" aria-hidden="true" /> : <Search className="h-[18px] w-[18px]" aria-hidden="true" />}
                    {busy === "find" ? "Looking…" : "Find flight"}
                  </button>
                  {found && <FoundCard f={found} />}
                </>
              )}
            </>
          )}
          {autoEdit && <FoundCard f={existing!} />}

          {mode === "manual" && !autoEdit && (
            <div className="space-y-3" data-testid="flight-manual">
              <label><span className={label}>Airline <span className="font-normal text-muted-foreground">(optional)</span></span><input data-testid="flight-airline" className={input} value={airline} onChange={(e) => setAirline(e.target.value)} placeholder="Copa Airlines" /></label>
              <div className="grid grid-cols-2 gap-3">
                <label><span className={label}>From</span><input data-testid="flight-from" className={cn(input, "uppercase")} value={from} onChange={(e) => setFrom(e.target.value.slice(0, 4))} placeholder="AUA" autoCapitalize="characters" /></label>
                <label><span className={label}>To</span><input data-testid="flight-to" className={cn(input, "uppercase")} value={to} onChange={(e) => setTo(e.target.value.slice(0, 4))} placeholder="PTY" autoCapitalize="characters" /></label>
                <label><span className={label}>Departs</span><input data-testid="flight-dep-time" type="time" className={input} value={depTime} onChange={(e) => setDepTime(e.target.value)} /></label>
                <label><span className={label}>Arrives</span><input data-testid="flight-arr-time" type="time" className={input} value={arrTime} onChange={(e) => setArrTime(e.target.value)} /></label>
              </div>
              <label><span className={label}>Arrival date <span className="font-normal text-muted-foreground">(only if a different day)</span></span><input data-testid="flight-arr-date" type="date" className={input} value={arrDate} min={date} onChange={(e) => setArrDate(e.target.value)} /></label>
              <p className="text-[13px] text-muted-foreground">Times are local to each airport. Flights added by hand do not update automatically.</p>
            </div>
          )}

          {showBooking && (
            <div className="space-y-3">
              <p className="text-sm font-bold">Your booking <span className="font-medium text-muted-foreground">(optional, only you see these)</span></p>
              <label><span className={label}>Confirmation code</span><input data-testid="flight-pnr-input" className={cn(input, "uppercase")} value={pnr} onChange={(e) => setPnr(e.target.value)} placeholder="WK89L2" autoCapitalize="characters" autoComplete="off" /></label>
              <div className="grid grid-cols-2 gap-3">
                <label><span className={label}>Seat</span><input data-testid="flight-seat" className={cn(input, "uppercase")} value={seat} onChange={(e) => setSeat(e.target.value)} placeholder="04A" autoCapitalize="characters" /></label>
                <label>
                  <span className={label}>Cabin</span>
                  <select data-testid="flight-cabin" className={input} value={cabin} onChange={(e) => setCabin(e.target.value)}>
                    <option value="">Not set</option>
                    {CABINS.map((c) => <option key={c} value={c}>{c}</option>)}
                    {cabin && !CABINS.includes(cabin) && <option value={cabin}>{cabin}</option>}
                  </select>
                </label>
              </div>
              {(autoEdit || (mode === "find" && found)) && (
                <div className="flex min-h-14 items-center gap-3">
                  <span className="flex-1">
                    <span className="block text-[15px] font-semibold">Keep status updated</span>
                    <span className="block text-[13px] text-muted-foreground">Alert me about delays and gate changes</span>
                  </span>
                  <button type="button" role="switch" aria-checked={alerts} aria-label="Keep status updated" onClick={() => setAlerts((a) => !a)} className={cn("flex h-8 w-[52px] shrink-0 items-center rounded-full p-[3px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary", alerts ? "justify-end bg-primary" : "justify-start bg-slate-400")}>
                    <span className="h-[26px] w-[26px] rounded-full bg-white shadow" />
                  </button>
                </div>
              )}
            </div>
          )}

          {error && <p role="alert" data-testid="flight-error" className="text-sm font-medium text-red-700 dark:text-red-300">{error}</p>}
        </div>

        <div className="mt-3 space-y-1">
          <button type="button" data-testid="flight-save" onClick={save} disabled={busy !== ""} className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
            {busy === "save" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {editing ? "Save changes" : "Save flight"}
          </button>
          {!autoEdit && (
            <div className="flex flex-col gap-1 sm:flex-row sm:justify-between">
              <button type="button" data-testid="flight-mode" onClick={() => { setMode(mode === "find" ? "manual" : "find"); setNotice(null); setError(""); }} className="min-h-12 rounded-xl px-3 text-[15px] font-semibold text-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                {mode === "find" ? "Can’t find it? Enter the details yourself" : "Try the flight number again"}
              </button>
              <button type="button" data-testid="flight-scan" onClick={() => file.current?.click()} disabled={busy !== ""} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border px-3 text-[15px] font-semibold hover:bg-accent disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                {busy === "scan" ? <Loader2 className="h-[18px] w-[18px] animate-spin" aria-hidden="true" /> : <Camera className="h-[18px] w-[18px]" aria-hidden="true" />}
                Scan ticket or boarding pass
              </button>
              <input ref={file} data-testid="flight-scan-input" type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void scan(f); }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
