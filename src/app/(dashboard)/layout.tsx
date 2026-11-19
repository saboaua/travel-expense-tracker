import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { ScrollArea } from "@/components/layout/ScrollArea";
import { ViewportGuard } from "@/components/layout/ViewportGuard";
import { DeferredHelpers } from "@/components/layout/DeferredHelpers";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // On phones this is a fixed-size frame: the content scrolls inside it and the bottom menu is part of the frame,
    // so the menu is always at the bottom of the screen however the page is scrolled or bounced.
    <div className="app-frame bg-page max-md:fixed max-md:inset-0 max-md:flex max-md:flex-col md:min-h-screen print:!static">
      <Sidebar />
      <ScrollArea>
        <main className="pb-6 md:pb-8">{children}</main>
      </ScrollArea>
      <MobileNav />
      <DeferredHelpers />
      <ViewportGuard />
    </div>
  );
}