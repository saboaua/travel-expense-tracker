import { GroceryReceiptDetail } from "@/components/personal/GroceryReceiptDetail";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <GroceryReceiptDetail id={id} />;
}
