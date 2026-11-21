import { GroceryReceiptForm } from "@/components/personal/GroceryReceiptForm";

export default async function Page({ params }: { params: Promise<{ id: string; rid: string }> }) {
  const { id, rid } = await params;
  return <GroceryReceiptForm receiptId={rid} area="other" typeId={id} />;
}
