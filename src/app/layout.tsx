import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});

export const metadata: Metadata = {
    title: "Catan Board Generator",
    description:
        "Generates Base Game and Seafarers boards. Every board is reproducible from the seed in its URL.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
    return (
        <html
            lang="en"
            className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
        >
            <body className="min-h-full flex flex-col">
                {children}
                {/* The /next entry point, not /react: it reads route changes
                    from the App Router itself, so client navigations are
                    counted without any per-page wiring. Renders nothing. */}
                <Analytics />
            </body>
        </html>
    );
}
