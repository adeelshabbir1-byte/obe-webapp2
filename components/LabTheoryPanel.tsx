"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Status = { sessions: number; manualsApproved: number; manualsWaiting: number; manualsMissing: number; held: number; marks: number; attendance: number | null; issues: number; badIssues: number };
type Setting = { intoTheory: boolean; weightPct: number; approvedAt: string | null; approvedBy: string | null; changeRequest: string | null; ready: boolean };

/** The lab under its theory course: whether lab marks go into the theory result, the theory instructor's approval, and the lab's status. */
export default function LabTheoryPanel({ labCourseId, theoryCode, as, canSet, setting, status }: { labCourseId: string; theoryCode: string | null; as: "ENGINEER" | "LEAD"; canSet: boolean; setting: Setting; status: Status }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [into, setInto] = useState(setting.intoTheory);
  const [w, setW] = useState(String(setting.weightPct));
  const [reason, setReason] = useState("");
  async function act(body: Record<string, unknown>, confirmText?: string) {
    if (confirmText && !confirm(confirmText)) return;
    setBusy(true); setMsg(null);
    const r = await fetch("/api/lab/theory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ labCourseId, ...body }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (r.ok) { setMsg({ ok: true, t: body.action === "approve" ? `Approved: ${d.imported} student(s) brought into ${theoryCode}${d.created ? `; a Lab assessment of ${w}% was added${d.scaled ? ` and the other ${d.scaled} assessments scaled to keep 100%` : ""}` : ""}.` : "Saved." }); router.refresh(); }
    else setMsg({ ok: false, t: d.error || "Could not save" });
  }
  const stat = (label: string, value: string, bad?: boolean) => <div style={{ minWidth: 110 }}><div style={{ fontSize: 19, fontWeight: 800, color: bad ? "#B3261E" : "#1E6B3A" }}>{value}</div><div className="small-note" style={{ margin: 0 }}>{label}</div></div>;
  return (
    <div className="card" style={{ borderLeft: `5px solid ${setting.intoTheory ? (setting.approvedAt ? "#1E6B3A" : "#9A3412") : "#1F4E8C"}` }}>
      <h3 style={{ marginTop: 0 }}>Lab and the theory course {theoryCode ? `(${theoryCode})` : ""}</h3>
      {!setting.ready && <div className="err">Lab marks in the theory result need prisma/migration_lab_theory.sql — run it in Supabase.</div>}
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 10 }}>
        {stat("manuals approved", `${status.manualsApproved}/${status.sessions}`, status.manualsApproved < status.sessions)}
        {stat("waiting for approval", String(status.manualsWaiting), status.manualsWaiting > 0)}
        {stat("labs held", `${status.held}/${status.sessions}`)}
        {stat("attendance (marked)", status.attendance === null ? "—" : `${status.attendance}%`, status.attendance !== null && status.attendance < 75)}
        {stat("plan problems", String(status.issues), status.badIssues > 0)}
      </div>
      {!theoryCode ? <p className="small-note">No theory course was found for this lab (its code should be the theory code followed by -L), so it stays a separate course.</p> : (
        <>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ fontSize: 13.5 }}><input type="checkbox" checked={into} disabled={!canSet || busy} onChange={(e) => setInto(e.target.checked)} /> <b>Lab marks go into the theory result</b></label>
            {into && <label style={{ fontSize: 13 }}>as <input type="number" min={5} max={50} value={w} disabled={!canSet || busy} onChange={(e) => setW(e.target.value)} style={{ width: 60 }} />% of {theoryCode}</label>}
            {canSet && (into !== setting.intoTheory || Number(w) !== setting.weightPct) && <button className="btn btn-sm" disabled={busy} onClick={() => act({ action: "setting", intoTheory: into, weightPct: Number(w) }, !into && setting.approvedAt ? `Take the lab marks out of ${theoryCode}? The Lab assessment OBEHUB added is removed and the old weights put back.` : undefined)}>Save</button>}
          </div>
          <p className="small-note" style={{ margin: "6px 0" }}>{setting.intoTheory ? `On: after the lab ends the theory instructor approves the lab marks; they then appear in ${theoryCode} as its Lab assessment (split by the CLOs of the lab sessions), the lab has no grade or credits of its own on the transcript (shown as IT), and its credit hours are added to ${theoryCode}'s line.` : "Off: the lab is a separate course with its own result and transcript line."}</p>
          {setting.intoTheory && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {setting.approvedAt ? <span style={{ fontWeight: 700, color: "#1E6B3A" }}>✓ Approved {new Date(setting.approvedAt).toLocaleDateString("en-GB")}{setting.approvedBy ? ` by ${setting.approvedBy}` : ""} — lab marks locked</span> : <span style={{ fontWeight: 700, color: "#9A3412" }}>Lab marks not yet approved into {theoryCode}</span>}
              {as === "LEAD" && !setting.approvedAt && <button className="btn btn-brass btn-sm" disabled={busy || !status.marks} onClick={() => act({ action: "approve" }, `Approve the lab marks into ${theoryCode}? They will be locked for the Lab Engineer.${status.held < status.sessions ? ` Only ${status.held} of ${status.sessions} labs have marks.` : ""}`)}>Approve lab marks into {theoryCode}</button>}
              {as === "LEAD" && setting.approvedAt && <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => act({ action: "reopen", reason: setting.changeRequest || "" }, "Reopen the lab marks so the Lab Engineer can correct them? Approve again afterwards.")}>Reopen for a correction</button>}
            </div>
          )}
          {setting.changeRequest && <div style={{ marginTop: 8, padding: "8px 10px", background: "#FFF4E5", borderRadius: 8, fontSize: 13 }}><b>The Lab Engineer asks for a change:</b> {setting.changeRequest}</div>}
          {as === "ENGINEER" && setting.intoTheory && setting.approvedAt && (
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Which marks need changing, and why" style={{ minWidth: 260, flex: 1 }} aria-label="Reason for the change" />
              <button className="btn btn-secondary btn-sm" disabled={busy || !reason.trim()} onClick={() => act({ action: "request", reason })}>Ask for a change</button>
            </div>
          )}
        </>
      )}
      {msg && <p style={{ margin: "8px 0 0", fontSize: 13, color: msg.ok ? "#1E6B3A" : "#B3261E" }}>{msg.t}</p>}
    </div>
  );
}
