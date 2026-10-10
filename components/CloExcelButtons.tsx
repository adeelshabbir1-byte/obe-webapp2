"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Download the CLOs as an Excel file, or upload an edited one back (updates matching CLOs, adds new ones, never deletes).
export default function CloExcelButtons({ courseId, canImport }: { courseId: string; canImport: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function upload(file: File) {
    setBusy(true); setMsg("");
    const fd = new FormData(); fd.append("file", file);
    try {
      const res = await fetch(`/api/subjectexpert/courses/${courseId}/clo/import`, { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) setMsg(d.error || "Import failed.");
      else { setMsg(`${d.added} added, ${d.updated} updated.${d.errors?.length ? " Skipped: " + d.errors.join("; ") : ""}`); router.refresh(); }
    } catch { setMsg("Import failed."); }
    setBusy(false);
    if (input.current) input.current.value = "";
  }

  return (
    <div className="card no-print" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <a href={`/api/subjectexpert/courses/${courseId}/clo/export`} className="btn btn-brass" style={{ fontSize: 12, padding: "6px 12px", textDecoration: "none" }}>Export CLOs to Excel</a>
      {canImport && (
        <>
          <button className="btn btn-brass" disabled={busy} style={{ fontSize: 12, padding: "6px 12px" }} onClick={() => input.current?.click()}>{busy ? "Importing…" : "Import CLOs from Excel"}</button>
          <input ref={input} type="file" accept=".xlsx,.csv" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
        </>
      )}
      {msg && <span style={{ fontSize: 12.5, color: "var(--slate)" }}>{msg}</span>}
    </div>
  );
}
