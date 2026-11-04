import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { OfflineSync } from "@/components/OfflineSync";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div className="md:pl-64">
        <main className="pb-20 md:pb-8">{children}</main>
      </div>
      <MobileNav />
      <OfflineSync />
    </div>
  );
}