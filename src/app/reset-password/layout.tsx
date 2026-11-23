import { titled } from "@/lib/page-title";
export async function generateMetadata() {
  return titled("Reset password");
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
