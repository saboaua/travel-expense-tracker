"use client";

import { useBrand } from "@/lib/use-brand";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Camera, Check, ChevronRight, Coins, Home, MapPin, Plane, Plus, Send, Share, ShoppingCart, Users, Wallet, Wifi, X, Zap, Mail, Download, ShoppingBag, Award, BedDouble, Briefcase, CreditCard, FileText, PiggyBank } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { isMissingColumn } from "@/lib/columns";
import { currentPlace } from "@/lib/scan-place";
import { countryName } from "@/lib/scan-destination";
import { homeCurrency } from "@/lib/personal/currency-guess";
import { HIGHLIGHTS, TOUR_STEPS, TRACKS, installPlatform, type HighlightId, type Platform, type TrackId } from "@/lib/welcome";
import { cn } from "@/lib/utils";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const Pill = ({ children }: { children: ReactNode }) => <span className="inline-block rounded-lg bg-blue-50 px-2 py-1 text-[11px] font-extrabold uppercase tracking-wider text-blue-700 dark:bg-blue-950 dark:text-blue-300">{children}</span>;
const Title = ({ children, sub }: { children: ReactNode; sub: ReactNode }) => (
  <div>
    <h2 id="welcome-title" className="text-[28px] font-extrabold leading-[1.1] tracking-tight">{children}</h2>
    <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{sub}</p>
  </div>
);
const Feature = ({ icon, title, text }: { icon: ReactNode; title: string; text: string }) => (
  <div className="flex items-start gap-3.5">
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300" aria-hidden="true">{icon}</span>
    <div><div className="text-base font-bold">{title}</div><div className="mt-0.5 text-sm leading-snug text-muted-foreground">{text}</div></div>
  </div>
);
const Learn = ({ slug, label }: { slug: string; label: string }) => (
  <a href={`/help/${slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 text-[13px] font-bold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" data-testid="tour-learn">
    <BookOpen className="h-4 w-4" aria-hidden="true" />{label}<ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
  </a>
);

function AreaRow({ color, icon, label, amount, limit }: { color: string; icon: ReactNode; label: string; amount: number; limit: number }) {
  return (
    <div className="border-t py-2">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-[10px]" style={{ background: `${color}1a`, color }} aria-hidden="true">{icon}</span>
        <b className="flex-1 text-[15px]">{label}</b>
        <span className="text-[15px] tabular-nums"><b>{amount.toLocaleString("en-US")}</b><span className="text-[13px] text-muted-foreground"> / {limit.toLocaleString("en-US")}</span></span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full" style={{ width: `${Math.min(100, (amount / limit) * 100)}%`, background: color }} /></div>
    </div>
  );
}

const Count = ({ n }: { n: number }) => <Pill>Highlight {n} of {HIGHLIGHTS.length}</Pill>;
const Row = ({ icon, tone, title, text }: { icon: ReactNode; tone: string; title: string; text: string }) => (
  <div className="flex items-start gap-3.5">
    <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px]", tone)} aria-hidden="true">{icon}</span>
    <div><div className="text-base font-bold">{title}</div><div className="mt-0.5 text-sm leading-snug text-muted-foreground">{text}</div></div>
  </div>
);
const SOFT = { blue: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300", violet: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300", teal: "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300", amber: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300", red: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300", green: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300", indigo: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300" };
const Chip = ({ children, tone = "bg-muted text-muted-foreground" }: { children: ReactNode; tone?: string }) => <span className={cn("whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold", tone)}>{children}</span>;

function Slide({ id }: { id: HighlightId }) {
  if (id === "scan") {
    return (
      <>
        <div><Count n={1} /><div className="mt-2.5"><Title sub="Tap the camera on the dashboard, or Upload a photo. Check the details, then save.">Scan, don&apos;t type</Title></div></div>
        <div className="flex items-stretch gap-3" aria-hidden="true">
          <div className="flex-1 rounded-2xl border bg-muted/50 p-3 font-mono text-xs leading-7"><b className="block text-center">SUPER FOOD</b>MILK 1L · 3.25<br />CHICKEN · 14.88<br />BREAD · 8.20<br /><b>TOTAL · 26.33</b></div>
          <div className="flex items-center text-xl text-primary">→</div>
          <div className="flex-1 rounded-2xl border border-blue-200 bg-blue-50 p-3 text-[13px] leading-7 dark:border-blue-900 dark:bg-blue-950"><div><span className="text-muted-foreground">Store</span> <b>Super Food</b></div><div><span className="text-muted-foreground">Items</span> <b>3</b></div><div><span className="text-muted-foreground">Total</span> <b>AWG 26.33</b></div></div>
        </div>
        <Feature icon={<Camera className="h-5 w-5" />} title="Flat and lit" text="Lay the receipt flat and avoid glare." />
        <Feature icon={<Check className="h-5 w-5" />} title="Rows that look off are marked" text="You fix them before anything is saved." />
        <Feature icon={<ShoppingBag className="h-5 w-5" />} title="Every line is sorted" text="Groceries, shopping and pharmacy are kept apart. A line it cannot place asks you once, then it remembers." />
        <Learn slug="add-a-trip-receipt" label="How to add a trip receipt" />
      </>
    );
  }
  if (id === "budget") {
    return (
      <>
        <div><Count n={2} /><div className="mt-2.5"><Title sub="One bar for the month. Groceries, shopping, bills, house and savings fill it in by themselves.">Know where your money goes</Title></div></div>
        <div className="rounded-[20px] border bg-card p-3.5 shadow-sm" data-testid="tour-budget" role="img" aria-label="Example budget: AWG 1,240 of 2,000 used, on track">
          <div className="flex items-center justify-between"><div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">November budget · example</div><span className="rounded-[10px] bg-green-100 px-2.5 py-1 text-xs font-bold text-green-900 dark:bg-green-950 dark:text-green-200">On track</span></div>
          <div className="mt-1.5 text-[28px] font-extrabold tabular-nums"><span className="text-[0.62em] font-bold tracking-wider opacity-65">AWG </span>1,240 <span className="text-[15px] font-semibold text-muted-foreground">of 2,000</span></div>
          <div className="relative mt-2.5"><div className="flex h-3.5 overflow-hidden rounded-full bg-muted"><div style={{ width: "21%", background: "#2563eb" }} /><div style={{ width: "6%", background: "#c026d3" }} /><div style={{ width: "15%", background: "#d97706" }} /><div style={{ width: "9%", background: "#16a34a" }} /><div style={{ width: "11%", background: "#7c3aed" }} /><div style={{ width: "6%", background: "#0d9488" }} /></div><div className="absolute -bottom-1 -top-1 w-0.5 bg-muted-foreground/70" style={{ left: "43%" }} /></div>
          <div className="mt-2 text-xs text-muted-foreground">Grey tick = where you should be today. AWG 760 left.</div>
          <div className="mt-2">
            <AreaRow color="#2563eb" icon={<ShoppingCart className="h-[17px] w-[17px]" />} label="Groceries" amount={420} limit={600} />
            <AreaRow color="#c026d3" icon={<ShoppingBag className="h-[17px] w-[17px]" />} label="Shopping" amount={120} limit={200} />
            <AreaRow color="#d97706" icon={<Zap className="h-[17px] w-[17px]" />} label="Utilities" amount={308} limit={400} />
            <AreaRow color="#16a34a" icon={<Coins className="h-[17px] w-[17px]" />} label="Quick spend" amount={180} limit={300} />
            <AreaRow color="#7c3aed" icon={<Home className="h-[17px] w-[17px]" />} label="House" amount={220} limit={400} />
          </div>
        </div>
        <Learn slug="monthly-budget" label="Set a monthly budget" />
      </>
    );
  }
  if (id === "trips") {
    return (
      <>
        <div><Count n={3} /><div className="mt-2.5"><Title sub="Add a trip once. Flights, hotel and papers stay in one card.">Trips that look after you</Title></div></div>
        <div className="rounded-2xl border bg-muted/40 p-3" aria-hidden="true">
          <div className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-900 text-[11px] font-bold text-white">CM</span><b className="flex-1 text-sm">CM 767 · Copa Airlines</b><Chip>Landed</Chip></div>
          <div className="mt-2 text-[15px] font-bold">AUA 03:55 PM — ✈ — PTY 04:44 PM</div>
          <div className="mt-1 text-xs text-muted-foreground">Next up: the return flight</div>
        </div>
        <div className="flex items-center gap-2.5 rounded-2xl border p-2.5" aria-hidden="true"><span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"><BedDouble className="h-5 w-5" /></span><div className="flex-1 text-sm font-bold">Hotel<div className="text-xs font-normal text-muted-foreground">Address and a Directions button</div></div><Chip tone="bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">Directions</Chip></div>
        <Row icon={<Plane className="h-5 w-5" />} tone={SOFT.blue} title="Flights update themselves" text="Add a flight number: status, gate and delays show, then the return takes over." />
        <Row icon={<FileText className="h-5 w-5" />} tone={SOFT.violet} title="Trip papers" text="Boarding passes, bookings and forms, kept with the trip." />
        <Row icon={<Wifi className="h-5 w-5" />} tone={SOFT.teal} title="Works on the plane" text="Current and upcoming trips, with their papers, are saved on your phone." />
        <Learn slug="add-a-flight" label="Add a flight to a trip" />
      </>
    );
  }
  if (id === "work") {
    return (
      <>
        <div><Count n={4} /><div className="mt-2.5"><Title sub="Group receipts by trip or by client project, then export.">Work expenses, ready to send</Title></div></div>
        <div className="rounded-2xl border bg-card p-3" aria-hidden="true">
          <div className="flex rounded-xl bg-muted p-1 text-[13px] font-bold"><span className="flex-1 py-1.5 text-center text-muted-foreground">Trips</span><span className="flex-1 rounded-[9px] bg-background py-1.5 text-center shadow-sm">Projects</span><span className="flex-1 py-1.5 text-center text-muted-foreground">Reports</span></div>
          <div className="mt-2.5 flex items-center gap-2.5"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"><Briefcase className="h-5 w-5" /></span><div className="flex-1"><b className="text-[15px]">Harbour rebrand</b><div className="text-xs text-muted-foreground">Blue Wave Co. · 14 receipts</div></div><b>$2,480.50</b></div>
          <div className="mt-2 h-1.5 rounded-full bg-muted"><div className="h-1.5 w-3/5 rounded-full bg-emerald-500" /></div>
        </div>
        <Row icon={<Briefcase className="h-5 w-5" />} tone={SOFT.indigo} title="Projects for clients" text="Client details, a budget and every receipt in one place." />
        <Row icon={<FileText className="h-5 w-5" />} tone={SOFT.amber} title="PDF and Excel reports" text="Totals by category with receipt photos. Pro unlocks the report; Free can download the photos." />
        <Learn slug="reports" label="Reports: business travel spending" />
      </>
    );
  }
  if (id === "papers") {
    return (
      <>
        <div><Count n={5} /><div className="mt-2.5"><Title sub="Keep what you need to show, even with no signal.">Your papers, always with you</Title></div></div>
        <div className="rounded-2xl border bg-card px-3 py-1.5" aria-hidden="true">
          <div className="flex items-center gap-2.5 py-2"><span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"><FileText className="h-5 w-5" /></span><div className="flex-1"><b className="text-[15px]">Passport</b><div className="text-xs text-muted-foreground">Expires 14 Mar 2027</div></div><Chip tone="bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">Reminder on</Chip></div>
          <div className="flex items-center gap-2.5 border-t py-2"><span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"><CreditCard className="h-5 w-5" /></span><div className="flex-1"><b className="text-[15px]">Super Food card</b><div className="text-xs text-muted-foreground">Barcode ready at the till</div></div><Chip tone="bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">Saved here</Chip></div>
        </div>
        <Row icon={<FileText className="h-5 w-5" />} tone={SOFT.red} title="Documents with reminders" text="Passport, insurance, tickets. We remind you before they expire." />
        <Row icon={<CreditCard className="h-5 w-5" />} tone={SOFT.amber} title="Loyalty cards" text="Scan once, show the barcode at the till." />
        <Row icon={<Wifi className="h-5 w-5" />} tone={SOFT.teal} title="Opens offline" text="Saved on your phone, refreshed when you are online." />
        <Learn slug="add-your-documents" label="Add your documents" />
      </>
    );
  }
  if (id === "community") {
    return (
      <>
        <div><Count n={6} /><div className="mt-2.5"><Title sub="Share your prices and see where an item costs less.">Cheaper groceries, together</Title></div></div>
        <div className="rounded-2xl border bg-card p-3" data-testid="tour-community" aria-hidden="true">
          <div className="text-xs font-bold text-muted-foreground">Profile › Community prices</div>
          <div className="mt-2 flex items-center gap-3"><div className="flex-1"><b className="text-[15px]">Share my prices</b><div className="text-[13px] text-muted-foreground">On. Thank you for helping.</div></div><span className="relative h-[30px] w-[52px] shrink-0 rounded-full bg-emerald-600"><span className="absolute left-[25px] top-[3px] h-6 w-6 rounded-full bg-white shadow" /></span></div>
        </div>
        <Row icon={<Users className="h-5 w-5" />} tone={SOFT.violet} title="Turn it on yourself" text="Profile, Community prices, then switch on Share my prices. It is off until you do." />
        <Row icon={<Check className="h-5 w-5" />} tone={SOFT.green} title="Only store, item, size and price" text="Never your name, email, receipts, dates or totals. Last 60 days only." />
        <Row icon={<Award className="h-5 w-5" />} tone={SOFT.amber} title="Earn badges" text="Share prices to become a Helper and level up. Turn it off and delete what you shared any time." />
        <Learn slug="community-prices" label="Share prices with the community" />
      </>
    );
  }
  const tile = (icon: ReactNode, tone: string, title: string, text: string) => (
    <div className="flex items-center gap-3 rounded-2xl border p-2.5"><span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px]", tone)} aria-hidden="true">{icon}</span><div className="flex-1"><div className="text-[15px] font-bold">{title}</div><div className="mt-px text-[13px] leading-snug text-muted-foreground">{text}</div></div></div>
  );
  return (
    <>
      <div><Count n={7} /><div className="mt-2.5"><Title sub="Each one has a guide in Help.">And it does the boring parts</Title></div></div>
      <div className="flex flex-col gap-2.5">
        {tile(<Mail className="h-5 w-5" />, "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300", "Bills from your Gmail", "Utility bills land in Utilities with a phone alert.")}
        {tile(<ShoppingCart className="h-5 w-5" />, "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300", "Price tracker and badges", "See which store is cheaper. Earn badges for sharing prices.")}
        {tile(<Send className="h-5 w-5" />, "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300", "Telegram", "Send a receipt photo to a chat and it is added.")}
        {tile(<Users className="h-5 w-5" />, "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300", "Share with a partner", "Look at the same budget, trip or card together.")}
        {tile(<PiggyBank className="h-5 w-5" />, "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300", "Fuel, subscriptions, savings", "Fill-ups, what renews each month, and goals.")}
      </div>
      <Learn slug="bills-from-email" label="Get your bills from your email" />
    </>
  );
}

export function WelcomeTour({ userId, forced, home, tracks }: { userId: string; forced: boolean; home: { country: string; city: string }; tracks: TrackId[] }) {
  const { appName } = useBrand();
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [step, setStep] = useState(0);
  const [slide, setSlide] = useState(0);
  const [picks, setPicks] = useState<TrackId[]>(tracks);
  const [country, setCountry] = useState(home.country);
  const [city, setCity] = useState(home.city);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [platform, setPlatform] = useState<Platform>("ios");
  const [tab, setTab] = useState<"ios" | "android">("ios");
  const [canInstall, setCanInstall] = useState(false);
  const deferred = useRef<InstallEvent | null>(null);
  const card = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const p = installPlatform(navigator.userAgent, navigator.maxTouchPoints);
    setPlatform(p);
    setTab(p === "android" ? "android" : "ios");
    const onPrompt = (e: Event) => { e.preventDefault(); deferred.current = e as InstallEvent; setCanInstall(true); };
    // The offer may have arrived while this code was still loading
    const early = (window as Window & { __earlyInstall?: Event }).__earlyInstall;
    if (early) onPrompt(early);
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  // Keep the page behind from scrolling, and start at the top of each step
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);
  useEffect(() => { card.current?.scrollTo({ top: 0 }); card.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus(); }, [step, slide]);

  const close = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      const supabase = createClient();
      // A replay from Help keeps the date it was first seen
      const base: Record<string, unknown> = forced ? { welcome_tracks: picks } : { welcome_seen_at: new Date().toISOString(), welcome_tracks: picks };
      const patch: Record<string, unknown> = { ...base };
      if (country.trim()) patch.home_country = country.trim().slice(0, 80);
      if (city.trim()) patch.home_city = city.trim().slice(0, 80);
      const { error } = await supabase.from("profiles").update(patch).eq("id", userId);
      if (error && isMissingColumn(error)) await supabase.from("profiles").update(base).eq("id", userId);
    } catch {
      /* offline: the popup may show once more, nothing is lost */
    }
    setOpen(false);
    router.replace("/");
    router.refresh();
  }, [saving, picks, country, city, userId, router, forced]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.stopPropagation(); void close(); return; }
    if (e.key !== "Tab" || !card.current) return;
    const f = [...card.current.querySelectorAll<HTMLElement>('button, a[href], input, [tabindex="0"]')].filter((el) => !el.hasAttribute("disabled"));
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  if (!open) return null;
  const name = TOUR_STEPS[step];
  const last = step === TOUR_STEPS.length - 1;
  const back = () => { if (name === "highlights" && slide > 0) setSlide(slide - 1); else if (step > 0) { if (name === "track") setSlide(HIGHLIGHTS.length - 1); setStep(step - 1); } };
  const next = () => {
    if (name === "highlights" && slide < HIGHLIGHTS.length - 1) return setSlide(slide + 1);
    if (last) return void close();
    setStep(step + 1);
  };
  const findMe = async () => {
    setLocating(true);
    const p = await currentPlace(6000);
    setLocating(false);
    if (!p) return;
    const c = countryName(p.countryCode);
    if (c) setCountry(c);
    if (p.city) setCity(p.city);
  };
  const install = async () => {
    const ev = deferred.current;
    if (!ev) return;
    await ev.prompt().catch(() => {});
    deferred.current = null;
    setCanInstall(false);
  };
  const cur = homeCurrency(country);
  const toggle = (id: TrackId) => setPicks((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const stepNo = (n: number, text: ReactNode) => (
    <div className="flex items-center gap-3"><span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-primary text-sm font-extrabold text-primary-foreground">{n}</span><div className="flex-1 text-[15px] leading-snug">{text}</div></div>
  );
  const glyph = (c: ReactNode) => <span className="mx-0.5 inline-flex align-text-bottom text-primary" aria-hidden="true">{c}</span>;
  const total = TOUR_STEPS.length;

  return (
    <div className="app-frame fixed inset-0 z-[80] flex items-stretch justify-center bg-slate-950/60 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="welcome-title" data-testid="welcome-tour" onKeyDown={onKey}>
      <div ref={card} className="flex w-full max-w-[520px] flex-col overflow-y-auto bg-background px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:max-h-[92vh] sm:rounded-[28px] sm:px-8 sm:pb-6 sm:pt-6 sm:shadow-2xl">
        <div className="flex min-h-11 items-center justify-between">
          <span className="text-[13px] font-semibold text-muted-foreground" data-testid="tour-count">{step + 1} of {total}</span>
          <button type="button" onClick={() => void close()} className="flex min-h-11 items-center gap-1 px-1 text-[15px] font-semibold text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" data-testid="tour-skip" disabled={saving}>
            {last ? <X className="h-5 w-5" aria-label="Close" /> : "Skip"}
          </button>
        </div>
        <div className="h-1 rounded-full bg-muted" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={step + 1} aria-label="Tour progress"><div className="h-1 rounded-full bg-primary transition-all" style={{ width: `${((step + 1) / total) * 100}%` }} /></div>

        <div className="flex flex-1 flex-col justify-center gap-[18px] py-5">
          {name === "welcome" && (
            <>
              <div className="flex h-[150px] items-center justify-center gap-3 rounded-3xl bg-gradient-to-br from-blue-700 to-sky-400" aria-hidden="true">
                {[Plane, Wallet, ShoppingCart].map((I, i) => <span key={i} className="flex h-[62px] w-[62px] items-center justify-center rounded-[18px] bg-white/20 text-white"><I className="h-8 w-8" /></span>)}
              </div>
              <Title sub="Your trips, spending and home bills in one place. Takes one minute to set up.">Welcome to {appName}</Title>
              <Feature icon={<Camera className="h-5 w-5" />} title="Snap a receipt" text="It reads the store, date and total for you." />
              <Feature icon={<Wallet className="h-5 w-5" />} title="See where it goes" text="Budgets, bills and groceries add up on their own." />
              <Feature icon={<Check className="h-5 w-5" />} title="You stay in charge" text="Nothing is saved until you check it." />
            </>
          )}
          {name === "highlights" && <Slide id={HIGHLIGHTS[slide].id} />}
          {name === "track" && (
            <>
              <Title sub="Pick any. We will tailor your checklist to these, and you can change it any time.">What do you want to track?</Title>
              <div className="flex flex-col gap-2.5" role="group" aria-label="What to track">
                {TRACKS.map((t) => {
                  const on = picks.includes(t.id);
                  return (
                    <button key={t.id} type="button" aria-pressed={on} onClick={() => toggle(t.id)} data-testid={`track-${t.id}`} className={cn("flex min-h-14 items-center gap-3 rounded-2xl border-2 px-3.5 text-left text-base font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary", on ? "border-primary bg-blue-50 text-blue-900 dark:bg-blue-950 dark:text-blue-100" : "border-input")}>
                      <span className="flex-1">{t.label}</span>
                      <span className={cn("flex h-[22px] w-[22px] items-center justify-center rounded-full", on ? "bg-primary text-primary-foreground" : "border-2 border-input")} aria-hidden="true">{on && <Check className="h-3.5 w-3.5" />}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
          {name === "home" && (
            <>
              <Title sub="Used to pick your currency and to tell home receipts from trip receipts.">Where do you live?</Title>
              <div><label htmlFor="tour-country" className="mb-1.5 block text-[13px] font-semibold text-muted-foreground">Country</label><Input id="tour-country" data-autofocus value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Aruba" maxLength={80} autoComplete="country-name" className="h-[50px] text-base" /></div>
              <div><label htmlFor="tour-city" className="mb-1.5 block text-[13px] font-semibold text-muted-foreground">City (optional)</label><Input id="tour-city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Oranjestad" maxLength={80} autoComplete="address-level2" className="h-[50px] text-base" /></div>
              {cur && <div className="flex items-start gap-2.5 rounded-[14px] bg-green-50 p-3 text-sm leading-snug text-green-900 dark:bg-green-950 dark:text-green-200" data-testid="tour-currency"><Check className="mt-0.5 h-[18px] w-[18px] shrink-0" aria-hidden="true" /><span>Receipts will start in <b>{cur}</b>. You can still pick another currency on any receipt.</span></div>}
              <button type="button" onClick={() => void findMe()} disabled={locating} className="flex min-h-11 items-center gap-2 text-[15px] font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><MapPin className="h-[18px] w-[18px]" aria-hidden="true" />{locating ? "Finding you..." : "Use my location"}</button>
            </>
          )}
          {name === "install" && (
            <>
              <div className="flex justify-center" aria-hidden="true"><div className="flex h-[84px] w-[84px] items-center justify-center rounded-[22px] bg-gradient-to-br from-blue-700 to-sky-400 text-white shadow-lg"><Wallet className="h-10 w-10" /></div></div>
              <Title sub="Opens like an app, full screen, and works offline. It is free and takes 10 seconds.">Add {appName} to your home screen</Title>
              <div className="flex rounded-[14px] bg-muted p-1" role="tablist" aria-label="Your phone">
                {(["ios", "android"] as const).map((t) => <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} data-testid={`tour-tab-${t}`} className={cn("min-h-10 flex-1 rounded-[11px] text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary", tab === t ? "bg-background font-bold shadow-sm" : "text-muted-foreground")}>{t === "ios" ? "iPhone" : "Android"}</button>)}
              </div>
              <div className="flex flex-col gap-3.5 rounded-[18px] border p-4" data-testid="tour-install-steps">
                {tab === "ios" ? (
                  <>
                    {stepNo(1, <>Open this page in <b>Safari</b></>)}
                    {stepNo(2, <>Tap Share {glyph(<Share className="h-5 w-5" />)} at the bottom</>)}
                    {stepNo(3, <>Scroll and tap <b>Add to Home Screen</b> {glyph(<Plus className="h-5 w-5" />)}</>)}
                    {stepNo(4, <>Tap <b>Add</b>. {appName} is now on your phone</>)}
                  </>
                ) : (
                  <>
                    {canInstall ? (
                      <Button type="button" className="min-h-12 w-full text-base" onClick={() => void install()} data-testid="tour-install"><Download className="mr-2 h-5 w-5" aria-hidden="true" />Install {appName}</Button>
                    ) : (
                      <>
                        {stepNo(1, <>Open this page in <b>Chrome</b></>)}
                        {stepNo(2, <>Tap the menu <b>⋮</b> at the top right</>)}
                        {stepNo(3, <>Tap <b>Install app</b> or <b>Add to Home screen</b></>)}
                        {stepNo(4, <>Tap <b>Install</b>. {appName} is now on your phone</>)}
                      </>
                    )}
                  </>
                )}
              </div>
              {platform === "other" && <p className="text-center text-xs leading-relaxed text-muted-foreground">On a computer you can skip this. Open {appName} on your phone to add it.</p>}
              <Learn slug="add-to-home-screen" label="Add the app to your home screen" />
            </>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex justify-center gap-1.5" aria-hidden="true">
            {TOUR_STEPS.map((s, i) => <span key={s} className={cn("h-2 rounded-full", i === step ? "w-6 bg-primary" : "w-2 bg-muted-foreground/30")} />)}
          </div>
          <Button type="button" className="mt-2.5 min-h-[54px] rounded-2xl text-[17px] font-bold" onClick={next} disabled={saving} data-testid="tour-next" data-autofocus>
            {name === "welcome" ? "Get started" : last ? "Done, open my dashboard" : "Next"}
          </Button>
          {step > 0 ? (
            <button type="button" onClick={back} className="flex min-h-11 items-center justify-center text-[15px] font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" data-testid="tour-back">Back</button>
          ) : (
            <button type="button" onClick={() => void close()} disabled={saving} className="flex min-h-11 items-center justify-center text-[15px] font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" data-testid="tour-look">I&apos;ll look around myself</button>
          )}
        </div>
      </div>
    </div>
  );
}
