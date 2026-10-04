import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "EMEA Clash | Map Veto System",
  description: "Real-time map veto system for VALORANT EMEA Clash tournaments.",
  keywords: ["esports", "valorant", "veto", "map veto", "tournament", "emea clash"],
  icons: {
    icon: "/clash-favicon.png",
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
      </body>
    </html>
  );
}

