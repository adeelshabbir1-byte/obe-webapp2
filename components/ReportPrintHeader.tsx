"use client";

import { useEffect, useState } from "react";

export default function ReportPrintHeader({ title, instituteName }: { title: string; instituteName?: string }) {
  const [fetchedName, setFetchedName] = useState<string | null>(null);

  useEffect(() => {
    if (instituteName) return;
    fetch("/api/institute-info").then((r) => r.json()).then((d) => setFetchedName(d.instituteName)).catch(() => {});
  }, [instituteName]);

  return (
    <div className="print-header">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .sidebar { display: none !important; }
          .main { padding: 0 !important; }
        }
        .print-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
      `}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div className="seal" style={{ width: 44, height: 44, margin: 0, fontSize: 11 }}>NCEAC</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, fontFamily: "Georgia, serif" }}>{title}</div>
          <div style={{ fontSize: 11, color: "var(--slate)" }}>{instituteName || fetchedName || "National Computing Education Accreditation Council"}</div>
        </div>
      </div>
      <button onClick={() => window.print()} className="btn btn-brass no-print" style={{ padding: "6px 14px", fontSize: 12.5 }}>
        Print
      </button>
    </div>
  );
}
