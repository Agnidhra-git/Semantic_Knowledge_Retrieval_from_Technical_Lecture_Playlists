import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { NavBar } from "@/components/NavBar";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "AeroLearn — Aerospace Lecture Search",
  description: "Semantic search across NPTEL aerospace engineering lectures",
  openGraph: {
    title: "AeroLearn",
    description: "Search NPTEL aerospace lecture content semantically",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-white text-slate-900 antialiased">
        {/* Navigation Bar */}
        <NavBar />

        {/* Main Content */}
        <main className="pt-14">
          {children}
        </main>
      </body>
    </html>
  );
}
