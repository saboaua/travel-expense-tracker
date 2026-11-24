import { BackLink } from "@/components/ui/page-header";
import { SubscriptionsView } from "@/components/subscriptions/SubscriptionsView";
import { PAGE_WIDTH } from "@/components/layout/PageShell";

export const metadata = { title: "Subscriptions" };

export default function SubscriptionsPage() {
  return (
    <div className={`${PAGE_WIDTH.wide} space-y-6 p-4 pb-28 md:p-8`}>
      <BackLink href="/personal">Personal</BackLink>
      <SubscriptionsView />
    </div>
  );
}
