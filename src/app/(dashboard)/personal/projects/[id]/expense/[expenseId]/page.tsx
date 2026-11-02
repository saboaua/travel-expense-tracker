import { PersonalExpenseForm } from "@/components/personal/PersonalExpenseForm";

export default async function Page({ params }: { params: Promise<{ id: string; expenseId: string }> }) {
  const { id, expenseId } = await params;
  return <PersonalExpenseForm kind="home_project" projectId={id} expenseId={expenseId} />;
}
