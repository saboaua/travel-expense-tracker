import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Inter } from "next/font/google";
import "./globals.css";
import { InstallPrompt } from "@/components/InstallPrompt";
import { UpdateNotice } from "@/components/UpdateNotice";
import { PullToRefresh } from "@/components/PullToRefresh";
import { AppHeight } from "@/components/layout/AppHeight";
import { AppSplash } from "@/components/AppSplash";
import { SPLASH_CSS, startupImages } from "@/lib/splash";
import { ConfirmProvider } from "@/components/ui/confirm";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Travel Expense Tracker",
  description: "Scan receipts, track business travel expenses, and generate reports",
  manifest: "/api/manifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Expenses",
    startupImage: startupImages,
  },
  icons: {
    icon: "/api/icon",
    apple: "/api/icon",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#4f46e5",
};

const themeScript = `
(function() {
  try {
    var t = localStorage.getItem('theme');
    if (t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
    }
  } catch (e) {}
})();
`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Per-request nonce set by the middleware (Content-Security-Policy). This also makes every page dynamic.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <style dangerouslySetInnerHTML={{ __html: SPLASH_CSS }} />
        <script nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${inter.className} antialiased`}>
        <AppSplash />
        <ConfirmProvider>{children}</ConfirmProvider>
        <InstallPrompt />
        <UpdateNotice />
        <AppHeight />
        <PullToRefresh />
      </body>
    </html>
  );
}
