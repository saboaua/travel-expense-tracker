import { ProjectsList } from "@/components/personal/ProjectsList";

export const metadata = { title: "Personal trips" };

export default function Page() {
  return <ProjectsList kind="personal_trip" />;
}
