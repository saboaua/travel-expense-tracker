import { IptvClientEditor } from "@/components/iptv/IptvClientEditor";

export default async function IptvClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <IptvClientEditor id={id} />;
}
