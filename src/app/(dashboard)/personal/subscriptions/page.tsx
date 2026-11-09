import { BackLink } from "@/components/ui/page-header";
import { SubscriptionsView } from "@/components/subscriptions/SubscriptionsView";

export default function SubscriptionsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 pb-28 md:p-8">
      <BackLink href="/personal">Personal</BackLink>
      <SubscriptionsView />
    </div>
  );
}
