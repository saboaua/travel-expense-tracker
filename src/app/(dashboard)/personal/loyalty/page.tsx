import { PageShell } from "@/components/layout/PageShell";
import { BackLink } from "@/components/ui/page-header";
import { LoyaltyWallet } from "@/components/loyalty/LoyaltyWallet";

export default function LoyaltyPage() {
  return (
    <PageShell size="wide" className="pb-28 md:pb-8">
      <BackLink href="/personal">Personal</BackLink>
      <LoyaltyWallet />
    </PageShell>
  );
}
