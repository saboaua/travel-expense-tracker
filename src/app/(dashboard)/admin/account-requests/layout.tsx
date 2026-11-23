import { titled } from "@/lib/page-title";
export async function generateMetadata() {
  return titled("Account requests");
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
