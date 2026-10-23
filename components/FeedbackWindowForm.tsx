"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

/** The feedback window (weeks of the semester) and the minimum number of answers before a teacher sees results. */
export default function FeedbackWindowForm({ fromWeek, toWeek, minResponses }: { fromWeek: number | null; toWeek: number | null; minResponses: number }) {
  const router = useRouter();
  const [f, setF] = useState(fromWeek === null ? "" : String(fromWeek));
  const [t, setT] = useState(toWeek === null ? "" : String(toWeek));
  const [m, setM] = useState(String(minResponses));
  const [msg, setMsg] = useState("");
  return (
    <div className="card">
      <h2 style={{ fontSize: 17, margin: "0 0 4px" }}>Feedback window and privacy</h2>
      <p className="small-note" style={{ marginTop: 0 }}>Students can give feedback only in these weeks of their semester (counted from the semester start date the Program Lead set). Leave both empty to keep feedback open all semester.</p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
        <label style={{ fontSize: 12.5 }}>From week<input type="number" min={1} max={20} value={f} onChange={(e) => setF(e.target.value)} style={{ width: 80, display: "block" }} /></label>
        <label style={{ fontSize: 12.5 }}>To week<input type="number" min={1} max={20} value={t} onChange={(e) => setT(e.target.value)} style={{ width: 80, display: "block" }} /></label>
        <label style={{ fontSize: 12.5 }}>Minimum answers before results are shown<input type="number" min={1} max={50} value={m} onChange={(e) => setM(e.target.value)} style={{ width: 80, display: "block" }} /></label>
        <button className="btn btn-sm" onClick={async () => {
          const r = await fetch("/api/evaluations/questionnaires", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "settings", fromWeek: f, toWeek: t, minResponses: m }) });
          const d = await r.json().catch(() => ({}));
          setMsg(r.ok ? "Saved." : d.error || "Could not save."); if (r.ok) router.refresh();
        }}>Save</button>
        {msg && <span style={{ fontSize: 13, color: msg === "Saved." ? "#1E7B45" : "#C62828" }}>{msg}</span>}
      </div>
    </div>
  );
}
