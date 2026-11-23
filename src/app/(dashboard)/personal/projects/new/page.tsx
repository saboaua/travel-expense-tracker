import { ProjectForm } from "@/components/personal/ProjectForm";

export const metadata = { title: "New project" };

export default function Page() {
  return <ProjectForm kind="home_project" />;
}
