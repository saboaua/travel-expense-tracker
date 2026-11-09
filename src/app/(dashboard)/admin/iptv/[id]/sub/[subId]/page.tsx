import { SubscriptionEditor } from "@/components/iptv/SubscriptionEditor";

export default async function IptvSubscriptionPage({ params }: { params: Promise<{ id: string; subId: string }> }) {
  const { id, subId } = await params;
  return <SubscriptionEditor customerId={id} subId={subId} />;
}
