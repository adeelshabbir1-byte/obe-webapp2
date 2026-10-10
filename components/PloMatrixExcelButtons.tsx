"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Download the batch's PLO-Course matrix as Excel, or upload an edited copy (adds the marked mappings, never removes any).
export default function PloMatrixExcelButtons({ batchId }: { batchId: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function upload(file: File) {
    setBusy(true); setMsg("");
    const fd = new FormData(); fd.append("file", file); fd.append("batchId", batchId);
    try {
      const res = await fetch("/api/omc/plo-matrix/import", { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) setMsg(d.error || "Import failed.");
      else { setMsg(`${d.added} mapping(s) added, ${d.already} already set.${d.errors?.length ? " Problems: " + d.errors.join("; ") : ""}`); router.refresh(); }
    } catch { setMsg("Import failed."); }
    setBusy(false);
    if (input.current) input.current.value = "";
  }

  return (
    <div className="card no-print" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <a href={`/api/omc/plo-matrix/export?batchId=${batchId}`} className="btn btn-brass" style={{ fontSize: 12, padding: "6px 12px", textDecoration: "none" }}>Export matrix to Excel</a>
      <button className="btn btn-brass" disabled={busy} style={{ fontSize: 12, padding: "6px 12px" }} onClick={() => input.current?.click()}>{busy ? "Importing…" : "Import matrix from Excel"}</button>
      <input ref={input} type="file" accept=".xlsx" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
      {msg && <span style={{ fontSize: 12.5, color: "var(--slate)" }}>{msg}</span>}
    </div>
  );
}
