import { titled } from "@/lib/page-title";
export async function generateMetadata() {
  return titled("Pro payments");
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
