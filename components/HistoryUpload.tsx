"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Upload a CSV of past years' results (save Excel as CSV first). */
export default function HistoryUpload() {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <input type="file" accept=".csv,text/csv" disabled={busy} onChange={async (e) => {
        const f = e.target.files?.[0]; if (!f) return;
        setBusy(true); setMsg("Uploading…");
        const r = await fetch("/api/prediction", { method: "POST", headers: { "Content-Type": "text/csv" }, body: await f.text() });
        const d = await r.json().catch(() => ({}));
        setBusy(false);
        if (!r.ok) { setMsg(d.error || "Could not upload."); return; }
        setMsg(`${d.added} result(s) added for ${d.cohorts} intake(s).${d.skipped ? ` ${d.skipped} row(s) skipped (rows ${d.badRows.join(", ")}) — check program, intake year, roll number, semester, course code and grade.` : ""}`);
        router.refresh();
      }} />
      <a href="/api/prediction" className="small-note">Download the template</a>
      {msg && <span className="small-note">{msg}</span>}
    </div>
  );
}
