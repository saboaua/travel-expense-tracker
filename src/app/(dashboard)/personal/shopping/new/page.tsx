import { GroceryReceiptForm } from "@/components/personal/GroceryReceiptForm";

export const metadata = { title: "Scan shopping receipt" };

export default function Page() {
  return <GroceryReceiptForm area="shopping" />;
}
