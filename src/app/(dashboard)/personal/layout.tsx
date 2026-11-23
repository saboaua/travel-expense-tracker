import { titled } from "@/lib/page-title";
export async function generateMetadata() {
  return titled("Personal");
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
