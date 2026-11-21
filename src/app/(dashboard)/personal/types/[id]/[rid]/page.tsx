import { GroceryReceiptDetail } from "@/components/personal/GroceryReceiptDetail";

export default async function Page({ params }: { params: Promise<{ rid: string }> }) {
  const { rid } = await params;
  return <GroceryReceiptDetail id={rid} />;
}
