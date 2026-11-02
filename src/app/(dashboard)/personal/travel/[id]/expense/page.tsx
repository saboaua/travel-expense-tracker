import { PersonalExpenseForm } from "@/components/personal/PersonalExpenseForm";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PersonalExpenseForm kind="personal_trip" projectId={id} />;
}
