import { titled } from "@/lib/page-title";
import { ProShell } from "./ProRail";

export async function generateMetadata() {
  return titled("Pro plan");
}

export default function ProLayout({ children }: { children: React.ReactNode }) {
  return <ProShell>{children}</ProShell>;
}
