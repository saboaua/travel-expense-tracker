"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/sharing/Modal";
import { InviteAnswer } from "@/components/sharing/InviteAnswer";
import { Button } from "@/components/ui/button";
import { nextInvitePopup, type IncomingInvite } from "@/lib/sharing";
import { useSharing } from "@/lib/use-sharing";

const SEEN_KEY = "sharing-popups-seen";
const read = (): string[] => {
  try { const v = JSON.parse(localStorage.getItem(SEEN_KEY) || "[]"); return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(-50) : []; } catch { return []; }
};
const remember = (id: string) => { try { localStorage.setItem(SEEN_KEY, JSON.stringify([...read(), id].slice(-50))); } catch { /* private mode: it may show again next visit */ } };

/**
 * Shown once per invite when the app opens: the invite to answer, and the "accepted" notice for the sender.
 * The bell keeps the invite until it is answered, so closing the popup with Later loses nothing.
 */
export function SharingPopups() {
  const [invite, setInvite] = useState<IncomingInvite | null>(null);
  const [accepted, setAccepted] = useState<{ id: string; name: string } | null>(null);

  const { overview } = useSharing();
  const [checked, setChecked] = useState(false);

  // Look once per page load, when the first answer arrives
  useEffect(() => {
    if (checked || !overview) return;
    setChecked(true);
    if (!overview.available) return;
    const seen = read();
    const inv = nextInvitePopup(overview, seen);
    if (inv) return setInvite(inv);
    const acc = overview.accepted.find((a) => !seen.includes(`accepted:${a.id}`));
    if (acc) setAccepted({ id: acc.id, name: acc.name });
  }, [overview, checked]);

  if (invite) {
    const close = () => { remember(invite.id); setInvite(null); };
    return (
      <Modal title="Sharing invite" onClose={close}>
        <InviteAnswer invite={invite} onDone={close} onLater={close} />
      </Modal>
    );
  }
  if (accepted) {
    const close = () => { remember(`accepted:${accepted.id}`); setAccepted(null); };
    return (
      <Modal title="Invite accepted" onClose={close}>
        <p className="text-sm text-muted-foreground"><span className="font-semibold text-foreground">{accepted.name}</span> accepted your invite. Open a card or a trip and choose what to share with them.</p>
        <div className="mt-4 flex justify-end"><Button type="button" onClick={close}>OK</Button></div>
      </Modal>
    );
  }
  return null;
}
