import { PersonalExpenseForm } from "@/components/personal/PersonalExpenseForm";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PersonalExpenseForm kind="home_project" projectId={id} />;
}
