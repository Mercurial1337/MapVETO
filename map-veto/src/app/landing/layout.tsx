import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "EMEA Clash | Tournament Tools Platform",
    description: "EMEA Clash esports tournament platform — Map Veto system, live broadcast graphics, synchronized timers, and more.",
    keywords: ["esports", "valorant", "emea clash", "tournament", "map veto", "broadcast", "graphics"],
    icons: {
        icon: "/clash-favicon.png",
    },
};

export default function LandingLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return children;
}
