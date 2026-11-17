import { FuelForm } from "@/components/personal/FuelForm";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FuelForm id={id} />;
}
