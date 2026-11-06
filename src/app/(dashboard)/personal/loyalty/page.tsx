import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LoyaltyWallet } from "@/components/loyalty/LoyaltyWallet";

export default function LoyaltyPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 pb-28 md:p-8">
      <Link href="/personal" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Personal
      </Link>
      <LoyaltyWallet />
    </div>
  );
}
