import type { Metadata } from "next";
import { Toaster } from "sonner";
import PerformanceMonitoring from "@/components/PerformanceMonitoring";
import "./globals.css";

export const metadata: Metadata = {
  title: "VG Veto | Map Veto System",
  description: "Real-time map veto system for VALORANT tournaments.",
  keywords: ["esports", "valorant", "veto", "map veto", "tournament", "vgveto"],
  icons: {
    icon: [{url:"/vgveto-favicon.png",type:"image/png",sizes:"32x32"}],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className="antialiased"
        suppressHydrationWarning
      >
        {children}
        <Toaster theme="dark" position="top-right" />
        {process.env.APP_ROUTING_MODE === 'standalone' && process.env.VERCEL_ENV === 'production' && (
          <PerformanceMonitoring />
        )}
      </body>
    </html>
  );
}

