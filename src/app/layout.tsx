import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import FuturisticBackground from "@/components/FuturisticBackground";
import IntroOverlay from "@/components/IntroOverlay";
import Navbar from "@/components/Navbar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "UNMASK Detector",
  description: "Futuristic deepfake detection for images and videos.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-black text-white`}>
        <FuturisticBackground />
        <IntroOverlay />
        <Navbar />

        {/* ✅ Render children ONE time only */}
        <div className="pt-24">{children}</div>
      </body>
    </html>
  );
}