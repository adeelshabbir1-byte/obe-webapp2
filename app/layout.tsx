import "./globals.css";
import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { Sora, Figtree } from "next/font/google";
import NavProgress from "../components/NavProgress";

// Self-hosted via next/font: no render-blocking request to Google at runtime,
// no layout shift, and the files are served from our own origin with
// immutable caching.
const sora = Sora({ subsets: ["latin"], variable: "--font-sora", display: "swap" });
const figtree = Figtree({ subsets: ["latin"], variable: "--font-figtree", display: "swap" });

export const metadata: Metadata = {
  title: { default: "OBEHUB — OBE Curriculum Governance", template: "%s · OBEHUB" },
  description: "Outcome-based education: curriculum governance, assessment and accreditation in one place.",
  applicationName: "OBEHUB",
};

export const viewport: Viewport = {
  themeColor: "#081C15",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sora.variable} ${figtree.variable}`}>
      <body>
        <Suspense fallback={null}>
          <NavProgress />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
