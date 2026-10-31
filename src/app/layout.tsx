import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { InstallPrompt } from "@/components/InstallPrompt";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Travel Expense Tracker",
  description: "Scan receipts, track business travel expenses, and generate reports",
  manifest: "/api/manifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Expenses",
  },
  icons: {
    icon: "/api/icon",
    apple: "/api/icon",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#4f46e5",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} antialiased`}>
        {children}
        <InstallPrompt />
      </body>
    </html>
  );
}
