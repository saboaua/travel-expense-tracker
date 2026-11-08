import { BackLink } from "@/components/ui/page-header";
import { LoyaltyWallet } from "@/components/loyalty/LoyaltyWallet";

export default function LoyaltyPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 pb-28 md:p-8">
      <BackLink href="/personal">Personal</BackLink>
      <LoyaltyWallet />
    </div>
  );
}
