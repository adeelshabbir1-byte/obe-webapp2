"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Item = { id: string; no: number; clo: string; level: string; marks: number; topic: string };
export default function PaperVettingEditor({ courseId, examType, items, initial, note, status }: { courseId: string; examType: string; items: Item[]; initial: Record<string, string>; note: string; status: string }) {
  const router = useRouter();
  const [qs, setQs] = useState(initial); const [tn, setTn] = useState(note); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState("");
  const locked = status === "SUBMITTED" || status === "APPROVED";
  async function go(action: string, extra: Record<string, unknown> = {}) {
    setBusy(action); setMsg("");
    const r = await fetch("/api/paper-vetting", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseId, examType, action, questions: qs, teacherNote: tn, ...extra }) });
    const d = await r.json().catch(() => ({})); setBusy("");
    setMsg(r.ok ? d.aiError || (action === "submit" ? "Sent to the Program Lead." : "Done.") : d.error || "Failed."); if (r.ok) router.refresh();
  }
  return (
    <div className="card">
      {items.map((i) => (
        <div key={i.id} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 13 }}><b>Q{i.no}</b> · {i.clo} · {i.level || "no level"} · {i.marks} marks <span className="small-note">({i.topic})</span></div>
          <textarea rows={3} style={{ width: "100%" }} disabled={locked} placeholder="Write the question exactly as it will appear on the paper" value={qs[i.id] || ""} onChange={(e) => setQs({ ...qs, [i.id]: e.target.value })} />
        </div>))}
      <label style={{ fontSize: 13 }}>Note to the Program Lead (optional)<textarea rows={2} style={{ width: "100%" }} disabled={locked} value={tn} onChange={(e) => setTn(e.target.value)} /></label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6, alignItems: "center" }}>
        {!locked && <><button type="button" className="btn btn-secondary btn-sm" disabled={!!busy} onClick={() => go("save")}>Save</button>
          <button type="button" className="btn btn-secondary btn-sm" disabled={!!busy} onClick={() => go("check")}>{busy === "check" ? "Checking…" : "Run system check"}</button>
          <button type="button" className="btn btn-secondary btn-sm" disabled={!!busy} onClick={() => go("check", { ai: true })}>Run system + AI check</button>
          <button type="button" className="btn btn-sm" disabled={!!busy} onClick={() => go("submit")}>Send to Program Lead</button></>}
        {locked && <button type="button" className="btn btn-secondary btn-sm" onClick={() => go("reopen")}>Reopen to change</button>}
        <span style={{ fontSize: 13 }}>{busy && busy !== "check" ? "Working…" : msg}</span>
      </div>
    </div>
  );
}
