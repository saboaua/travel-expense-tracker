import { titled } from "@/lib/page-title";
export async function generateMetadata() {
  return titled("Get Pro");
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
