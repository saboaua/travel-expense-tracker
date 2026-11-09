import { CustomerEditor } from "@/components/iptv/CustomerEditor";

export default async function IptvCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CustomerEditor id={id} />;
}
