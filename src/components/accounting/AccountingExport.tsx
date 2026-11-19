"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BookOpenCheck, CheckCircle2, ChevronRight, Crown, Download, Loader2, TriangleAlert } from "lucide-react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Alert } from "@/components/ui/alert";
import { useLimits } from "@/lib/use-limits";
import { PROGRAMS, programOf, type AccountSettings, type ProgramId } from "@/lib/accounting";

export type ExportScope = { scope: "trip" | "bproject" | "year" | "month"; id?: string; year?: string; month?: string };
type Preview = { label: string; programName: string; currency: string; expenses: number; already: number; entries: number; lines: number; debit: number; credit: number; balanced: boolean; missing: string[]; skippedNoUsd: number; categories: string[]; settings: AccountSettings; setupDone: boolean; ready: boolean };

const qs = (s: ExportScope, program: ProgramId, extra: Record<string, string>) => new URLSearchParams({ scope: s.scope, ...(s.id ? { id: s.id } : {}), ...(s.year ? { year: s.year } : {}), ...(s.month ? { month: s.month } : {}), program, ...extra }).toString();
const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const LAST = "lifolio:accounting:program";

/** "Export to accounting": pick the program, set the accounts once, review the journal entries, download the file. Pro. */
export function AccountingExport({ target, className, children }: { target: ExportScope; className?: string; children?: React.ReactNode }) {
  const lim = useLimits();
  const pro = !!lim && (lim.who.pro || lim.who.admin);
  const [open, setOpen] = useState(false);
  const [program, setProgram] = useState<ProgramId | null>(null);
  const [step, setStep] = useState<"format" | "accounts" | "review">("format");
  const [pv, setPv] = useState<Preview | null>(null);
  const [skip, setSkip] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [credit, setCredit] = useState({ code: "", name: "" });
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [downloaded, setDownloaded] = useState(false);

  const load = useCallback(async (p: ProgramId, skipNow: boolean): Promise<Preview | null> => {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/accounting/export?${qs(target, p, { preview: "1", skip: skipNow ? "1" : "0" })}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json.error || "Could not load the expenses."); return null; }
      setPv(json as Preview);
      return json as Preview;
    } catch { setError("Could not reach the server. Check your connection."); return null; } finally { setBusy(false); }
  }, [target]);

  const choose = async (p: ProgramId) => {
    setProgram(p); setDownloaded(false);
    try { localStorage.setItem(LAST, p); } catch { /* private mode */ }
    const r = await load(p, skip);
    if (!r) return;
    setCredit({ code: r.settings.credit_code, name: r.settings.credit_name });
    setCodes(r.settings.accounts);
    setStep(r.setupDone && !r.missing.length ? "review" : "accounts");
  };

  useEffect(() => { if (!open) { setStep("format"); setPv(null); setError(null); setDownloaded(false); } }, [open]);

  const save = async () => {
    if (!program) return;
    setBusy(true); setError(null);
    const res = await fetch("/api/accounting/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ program, credit_code: credit.code, credit_name: credit.name, accounts: codes }) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setBusy(false); setError(json.error || "Could not save."); return; }
    const r = await load(program, skip);
    if (r) setStep(r.missing.length ? "accounts" : "review");
  };

  if (lim && !pro) {
    return (
      <Link href="/personal/pro" className={className} data-testid="accounting-row-pro">
        {children ?? <><BookOpenCheck className="h-4 w-4" aria-hidden="true" /> Export to accounting <Crown className="h-4 w-4 text-amber-600" aria-hidden="true" /></>}
      </Link>
    );
  }
  const input = "min-h-11 w-full rounded-lg border bg-background px-3 text-base";
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)} data-testid="accounting-row">
        {children ?? <><BookOpenCheck className="h-4 w-4" aria-hidden="true" /> Export to accounting</>}
      </button>
      {open && (
        <BottomSheet title={step === "format" ? "Export to accounting" : step === "accounts" ? "Your accounts" : "Review the journal"} onClose={() => setOpen(false)} testId="accounting-sheet" tall>
          {error && <Alert className="mb-3">{error}</Alert>}
          {step === "format" && (
            <div className="space-y-1.5">
              <p className="mb-2 text-sm text-muted-foreground">Journal entries only: a debit for each expense and a credit for the account you paid from. Choose your program.</p>
              {PROGRAMS.map((p) => (
                <button key={p.id} type="button" disabled={busy} onClick={() => void choose(p.id)} className="flex min-h-[60px] w-full items-center gap-3 rounded-xl border px-3 text-left hover:bg-accent disabled:opacity-60" data-testid={`accounting-program-${p.id}`}>
                  <span className="min-w-0 flex-1"><span className="block text-[15px] font-bold">{p.name}</span><span className="block text-[12.5px] text-muted-foreground">{p.sub}</span></span>
                  {busy && program === p.id ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <ChevronRight className="h-5 w-5 text-muted-foreground" aria-hidden="true" />}
                </button>
              ))}
            </div>
          )}
          {step === "accounts" && pv && (
            <div className="space-y-3" data-testid="accounting-accounts">
              <p className="text-sm text-muted-foreground">Set this once. Use the account codes from your chart of accounts. You can change them later.</p>
              <div><label className="mb-1 block text-sm font-bold" htmlFor="ac-credit">Paid from (credit account)</label>
                <div className="flex gap-2"><input id="ac-credit" className={`${input} w-28`} placeholder="2100" value={credit.code} onChange={(e) => setCredit({ ...credit, code: e.target.value })} aria-label="Credit account code" data-testid="accounting-credit-code" />
                  <input className={input} placeholder="Company card" value={credit.name} onChange={(e) => setCredit({ ...credit, name: e.target.value })} aria-label="Credit account name" /></div></div>
              <div><p className="mb-1 text-sm font-bold">Account for each category (debit)</p>
                <div className="space-y-2">{pv.categories.map((c) => (
                  <div key={c} className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate text-sm">{c}</span>
                    <input className={`${input} w-28`} placeholder="Code" value={codes[c] ?? ""} onChange={(e) => setCodes({ ...codes, [c]: e.target.value })} aria-label={`Account code for ${c}`} data-testid={`accounting-code-${c}`} /></div>
                ))}</div></div>
              <button type="button" disabled={busy} onClick={() => void save()} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-base font-bold text-primary-foreground disabled:opacity-60" data-testid="accounting-save">{busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : null}Save and review</button>
            </div>
          )}
          {step === "review" && pv && program && (
            <div className="space-y-3" data-testid="accounting-review">
              <div className="rounded-xl border p-3 text-sm">
                <p className="font-bold">{pv.label}</p>
                <dl className="mt-2 grid grid-cols-[1fr_auto] gap-y-1.5">
                  <dt className="text-muted-foreground">Expenses</dt><dd data-testid="accounting-count">{pv.expenses}</dd>
                  <dt className="text-muted-foreground">Already exported</dt><dd data-testid="accounting-already">{pv.already}</dd>
                  <dt className="text-muted-foreground">Currency</dt><dd>{pv.currency}</dd>
                  <dt className="text-muted-foreground">Journal lines</dt><dd data-testid="accounting-lines">{pv.lines}</dd>
                  <dt className="text-muted-foreground">Debits / credits</dt><dd>{money(pv.debit)} / {money(pv.credit)}</dd>
                </dl>
                {pv.balanced ? <p className="mt-2 flex items-center gap-1.5 font-semibold text-green-700 dark:text-green-400" data-testid="accounting-balanced"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />Debits and credits balance</p>
                  : <p className="mt-2 font-semibold text-red-700">Debits and credits do not balance</p>}
              </div>
              <p className="text-xs text-muted-foreground">Amounts are booked in USD. Expenses in another currency keep the original amount and rate in the description.</p>
              {pv.skippedNoUsd > 0 && <p className="flex gap-1.5 text-xs text-amber-700 dark:text-amber-300"><TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />{pv.skippedNoUsd} expense{pv.skippedNoUsd === 1 ? " has" : "s have"} no USD value and {pv.skippedNoUsd === 1 ? "is" : "are"} left out.</p>}
              {pv.already > 0 && (
                <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="h-5 w-5" checked={skip} onChange={(e) => { setSkip(e.target.checked); void load(program, e.target.checked); setDownloaded(false); }} data-testid="accounting-skip" />Skip expenses already exported</label>
              )}
              {pv.entries === 0 ? <Alert variant="info">Nothing new to export.</Alert> : (
                <a href={`/api/accounting/export?${qs(target, program, { skip: skip ? "1" : "0" })}`} download onClick={() => setDownloaded(true)} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-base font-bold text-primary-foreground" data-testid="accounting-download">
                  <Download className="h-5 w-5" aria-hidden="true" />Download {programOf(program).ext.toUpperCase()} for {pv.programName}
                </a>
              )}
              {downloaded && <p className="text-center text-xs text-muted-foreground" data-testid="accounting-done">Downloaded. These expenses are now marked as exported.</p>}
              <div className="flex gap-2">
                <button type="button" onClick={() => setStep("accounts")} className="min-h-11 flex-1 rounded-xl border text-sm font-bold hover:bg-accent" data-testid="accounting-edit">Edit accounts</button>
                <button type="button" onClick={() => setStep("format")} className="min-h-11 flex-1 rounded-xl border text-sm font-bold hover:bg-accent">Change program</button>
              </div>
            </div>
          )}
        </BottomSheet>
      )}
    </>
  );
}
