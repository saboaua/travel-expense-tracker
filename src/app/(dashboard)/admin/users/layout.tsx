import { titled } from "@/lib/page-title";
export async function generateMetadata() {
  return titled("Users");
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
