import { ProjectForm } from "@/components/personal/ProjectForm";

export const metadata = { title: "New personal trip" };

export default function Page() {
  return <ProjectForm kind="personal_trip" />;
}
