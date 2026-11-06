import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { ScrollArea } from "@/components/layout/ScrollArea";
import { OfflineSync } from "@/components/OfflineSync";
import { ViewportGuard } from "@/components/layout/ViewportGuard";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // On phones this is a fixed-size frame: the content scrolls inside it and the bottom menu is part of the frame,
    // so the menu is always at the bottom of the screen however the page is scrolled or bounced.
    <div className="app-frame bg-background max-md:fixed max-md:inset-0 max-md:flex max-md:flex-col md:min-h-screen print:!static">
      <Sidebar />
      <ScrollArea>
        <main className="pb-6 md:pb-8">{children}</main>
      </ScrollArea>
      <MobileNav />
      <OfflineSync />
      <ViewportGuard />
    </div>
  );
}