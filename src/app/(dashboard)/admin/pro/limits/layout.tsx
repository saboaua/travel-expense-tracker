import { titled } from "@/lib/page-title";
export async function generateMetadata() {
  return titled("Pro limits");
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
