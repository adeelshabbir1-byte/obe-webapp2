"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

/** Demo institute only: realistic final-exam marks for every student still without one, in one click (still editable). */
export default function FillSampleMarks({ courseId, missing }: { courseId: string; missing: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function fill() {
    setBusy(true); setMsg("");
    const r = await fetch("/api/demo/fill-marks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseId }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg(j.error || `HTTP ${r.status}`); return; }
    setMsg(`${j.filled} marks filled. Check or change any of them below, then submit the result.`);
    router.refresh();
  }
  return (
    <div className="card no-print" style={{ borderLeft: "4px solid var(--brass)", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      <div style={{ flex: "1 1 320px", fontSize: 13 }}>
        <b>Demo:</b> {missing > 0 ? <>{missing} final-exam marks are still blank. Type them in the grid below, or fill realistic sample marks in one click — you can still edit them.</> : <>All marks are in.</>}
        {msg && <div style={{ marginTop: 4, color: msg.includes("filled") ? "#1B6B3A" : "#B3261E" }}>{msg}</div>}
      </div>
      {missing > 0 && <button type="button" className="btn btn-brass" disabled={busy} onClick={fill} data-fill-sample-marks>{busy ? "Filling…" : "Fill sample marks"}</button>}
    </div>
  );
}
