import { ProjectsList } from "@/components/personal/ProjectsList";

export const metadata = { title: "Projects" };

export default function Page() {
  return <ProjectsList kind="home_project" />;
}
