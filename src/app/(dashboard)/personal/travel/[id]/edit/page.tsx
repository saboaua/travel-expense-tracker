import { ProjectForm } from "@/components/personal/ProjectForm";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProjectForm kind="personal_trip" projectId={id} />;
}
