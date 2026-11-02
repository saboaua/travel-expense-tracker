import { PersonalExpenseForm } from "@/components/personal/PersonalExpenseForm";

export default async function Page({ params }: { params: Promise<{ id: string; expenseId: string }> }) {
  const { id, expenseId } = await params;
  return <PersonalExpenseForm kind="personal_trip" projectId={id} expenseId={expenseId} />;
}
