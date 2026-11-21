import { GroceryOverview } from "@/components/personal/GroceryOverview";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <GroceryOverview typeId={id} />;
}
