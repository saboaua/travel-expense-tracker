"use client";

import { useEffect, useMemo, useState } from "react";
import { CreditCard, Loader2, MoreVertical, Pencil, Plus, ScanBarcode, Search, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { filterCards, type LoyaltyCard } from "@/lib/loyalty";
import { removeLoyaltyCard } from "@/lib/loyalty-image";
import { fetchLoyaltyCards, loyaltyKey } from "@/lib/offline-data";
import { browserKv, loadWithCache } from "@/lib/offline-store";
import { useOnline } from "@/lib/use-online";
import { OfflineNotice } from "@/components/OfflineNotice";
import { CardFace } from "./CardFace";
import { CardDetail } from "./CardDetail";
import { CardForm } from "./CardForm";

const sortCards = (cards: LoyaltyCard[]) => [...cards].sort((a, b) => a.store_name.localeCompare(b.store_name, undefined, { sensitivity: "base" }));

export function LoyaltyWallet() {
  const confirm = useConfirm();
  const [userId, setUserId] = useState<string | null>(null);
  const [cards, setCards] = useState<LoyaltyCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<LoyaltyCard | null>(null);
  const [editing, setEditing] = useState<LoyaltyCard | "new" | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const online = useOnline();

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      // The session is read from the phone, so this works with no connection too
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return;
      setUserId(user.id);
      const res = await loadWithCache(browserKv, loyaltyKey(user.id), () => fetchLoyaltyCards(supabase, user.id));
      if (!res.ok) {
        const message = (res.error as { message?: string } | null)?.message || "Could not load your cards.";
        setError(/relation|does not exist|schema cache/i.test(message) ? "The loyalty cards table is not set up yet. Run supabase/migration_loyalty.sql in the Supabase SQL Editor." : message);
        return setCards([]);
      }
      setSavedAt(res.fromCache ? res.savedAt : null);
      setCards(sortCards(res.data));
    })();
  }, []);

  const shown = useMemo(() => filterCards(cards || [], query), [cards, query]);

  /** Adding, editing and deleting need a connection until the offline queue covers cards. */
  function needsConnection(): boolean {
    if (online) return false;
    setMenu(null);
    setError("You are offline. Your cards are here to use, but adding or changing them needs a connection for now.");
    return true;
  }

  async function remove(card: LoyaltyCard) {
    if (needsConnection()) return;
    setMenu(null);
    if (!(await confirm({ title: "Delete this card?", message: `${card.store_name} will be removed from your wallet, including its photo.`, confirmLabel: "Delete", destructive: true }))) return;
    try {
      await removeLoyaltyCard(createClient(), card);
      setCards((cs) => (cs || []).filter((c) => c.id !== card.id));
      setOpen((o) => (o?.id === card.id ? null : o));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete the card.");
    }
  }

  function saved(card: LoyaltyCard) {
    setCards((cs) => sortCards([...(cs || []).filter((c) => c.id !== card.id), card]));
    setOpen((o) => (o && o.id === card.id ? card : o));
    setEditing(null);
  }

  const addButton = (
    <Button type="button" className="h-11 w-full sm:h-10 sm:w-auto" onClick={() => !needsConnection() && setEditing("new")} disabled={!userId}>
      <Plus className="h-4 w-4" /> Add card
    </Button>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">Loyalty cards</h1>
          <p className="mt-1 text-sm text-muted-foreground">Every store card in one place. Open a card at the till and scan it from your screen.</p>
        </div>
        {cards && cards.length > 0 && addButton}
      </div>

      <OfflineNotice savedAt={savedAt} />

      {error && <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" role="alert">{error}</p>}

      {cards === null ? (
        <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading your cards…</p>
      ) : cards.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed px-5 py-10 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><CreditCard className="h-7 w-7" aria-hidden="true" /></span>
          <h2 className="text-base font-semibold">No loyalty cards yet</h2>
          <p className="max-w-xs text-sm text-muted-foreground">Add your first card and keep it on your phone, ready to scan.</p>
          <Button type="button" className="h-11 px-5" onClick={() => !needsConnection() && setEditing("new")} disabled={!userId}><Plus className="h-4 w-4" /> Add your first card</Button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-lg border bg-background px-3 text-sm text-muted-foreground focus-within:ring-2 focus-within:ring-ring sm:h-10 sm:max-w-sm">
              <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by store name" aria-label="Search cards" className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground" />
            </label>
            <span className="text-sm text-muted-foreground">{shown.length} card{shown.length === 1 ? "" : "s"}</span>
          </div>

          {shown.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No card matches “{query}”.</p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
              {shown.map((c) => (
                <li key={c.id} data-testid="loyalty-tile" className="relative">
                  <button type="button" onClick={() => setOpen(c)} aria-label={`Open ${c.store_name}`} className="block w-full rounded-xl text-left shadow-sm transition-transform active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                    <CardFace card={c} className="h-28 rounded-xl border border-black/10 sm:h-36">
                      <span className="absolute bottom-2 left-2 flex h-7 w-7 items-center justify-center rounded-md bg-black/30 backdrop-blur-sm" aria-hidden="true"><ScanBarcode className="h-4 w-4" /></span>
                    </CardFace>
                  </button>
                  <button type="button" onClick={() => setMenu(menu === c.id ? null : c.id)} aria-label={`More actions for ${c.store_name}`} aria-expanded={menu === c.id} className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded-lg text-white drop-shadow hover:bg-white/15"><MoreVertical className="h-[18px] w-[18px]" /></button>
                  {menu === c.id && (
                    <>
                      <button type="button" className="fixed inset-0 z-10 cursor-default" aria-label="Close menu" onClick={() => setMenu(null)} />
                      <div className="absolute right-1 top-10 z-20 w-36 rounded-lg border bg-card p-1 text-sm text-card-foreground shadow-lg">
                        <button type="button" className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left hover:bg-accent" onClick={() => { if (!needsConnection()) { setMenu(null); setEditing(c); } }}><Pencil className="h-4 w-4" /> Edit</button>
                        <button type="button" className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-red-600 hover:bg-accent" onClick={() => remove(c)}><Trash2 className="h-4 w-4" /> Delete</button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {open && !editing && <CardDetail card={open} onClose={() => setOpen(null)} onEdit={online ? () => setEditing(open) : undefined} />}
      {editing && userId && <CardForm key={editing === "new" ? "new" : editing.id} userId={userId} card={editing === "new" ? null : editing} onSaved={saved} onClose={() => setEditing(null)} />}
    </div>
  );
}
