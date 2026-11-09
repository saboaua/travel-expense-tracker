import { SubscriptionEditor } from "@/components/iptv/SubscriptionEditor";

export default async function NewIptvPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const { client } = await searchParams;
  return <SubscriptionEditor customerId={client && /^[0-9a-f-]{36}$/i.test(client) ? client : null} subId="new" />;
}
