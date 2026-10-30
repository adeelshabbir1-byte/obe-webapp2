import "./globals.css";
import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { Sora, Figtree } from "next/font/google";
import SaveShortcut from "../components/SaveShortcut";
import NavProgress from "../components/NavProgress";
import TourBar from "../components/TourBar";
import PwaRegister from "../components/PwaRegister";
import MonitoringInit from "../components/MonitoringInit";

// Self-hosted via next/font: no render-blocking request to Google at runtime,
// no layout shift, and the files are served from our own origin with
// immutable caching.
const sora = Sora({ subsets: ["latin"], variable: "--font-sora", display: "swap" });
const figtree = Figtree({ subsets: ["latin"], variable: "--font-figtree", display: "swap" });

export const metadata: Metadata = {
  title: { default: "OBE Curriculum Governance", template: "%s · OBE Curriculum Governance" },
  description: "Outcome-based education: curriculum governance, assessment and accreditation in one place.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon-192.png", apple: "/icon-192.png" },
  appleWebApp: { capable: true, title: "OBEHUB", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#3A1218",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sora.variable} ${figtree.variable}`}>
      <body>
        <SaveShortcut />
        <PwaRegister />
        <MonitoringInit />
        <Suspense fallback={null}>
          <NavProgress />
        </Suspense>
        {children}
        <Suspense fallback={null}><TourBar /></Suspense>
      </body>
    </html>
  );
}
