"use client";

import { useState } from "react";
import Link from "next/link";

type ReportDef = { id: string; href: string; title: string };

export default function PrintBundleClient({ bundleName, reports }: { bundleName: string; reports: ReportDef[] }) {
  const [mode, setMode] = useState<"menu" | "combined">("menu");

  if (reports.length === 0) {
    return (
      <div style={{ padding: 40, fontFamily: "system-ui" }}>
        <p style={{ color: "#46507A" }}>No reports in this bundle are available to you right now.</p>
      </div>
    );
  }

  if (mode === "combined") {
    return (
      <div>
        <style>{`
          @media print { .no-print { display: none !important; } .report-frame { break-after: page; } }
          .report-frame { width: 100%; height: 1100px; border: 1px solid #E3E8F3; margin-bottom: 20px; }
        `}</style>
        <div className="no-print" style={{ padding: "14px 20px", background: "#E1F0FF", color: "#0F2E57", borderBottom: "1px solid #C6DEF8", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <b>{bundleName}</b> — Combined View ({reports.length} reports)
            <div style={{ fontSize: 11.5, opacity: 0.8, marginTop: 2 }}>
              Best-effort combined print — if any report doesn't print cleanly this way, use "Open Individually" instead and print each one separately.
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setMode("menu")} className="btn btn-secondary btn-sm">Back</button>
            <button onClick={() => window.print()} className="btn btn-brass btn-sm">Print All</button>
          </div>
        </div>
        <div style={{ padding: 20 }}>
          {reports.map((r) => (
            <iframe key={r.id} src={r.href} className="report-frame" title={r.title} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 40, fontFamily: "system-ui", maxWidth: 700, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>{bundleName}</h1>
      <p style={{ color: "#46507A", fontSize: 13, marginBottom: 20 }}>{reports.length} report(s) in this bundle.</p>

      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <button onClick={() => setMode("combined")} style={{ padding: "8px 16px", background: "#1F89F5", color: "#fff", border: "none", cursor: "pointer" }}>
          View as One Combined Document
        </button>
      </div>

      <h3 style={{ fontSize: 14, marginBottom: 10 }}>Or Open Individually</h3>
      <p style={{ fontSize: 12, color: "#46507A", marginBottom: 12 }}>Click each to open in a new tab and print it on its own — the most reliable way to get clean output per report.</p>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {reports.map((r) => (
          <li key={r.id} style={{ marginBottom: 8 }}>
            <Link href={r.href} target="_blank" rel="noopener noreferrer" style={{ color: "#1570D6", textDecoration: "underline", fontSize: 13.5 }}>{r.title}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
