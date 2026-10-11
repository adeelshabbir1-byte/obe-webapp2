"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Req = { id: string; studentId: string; roll: string; name: string; oldGrade: string; newGrade: string; reason: string; status: string; decisionNote: string | null; createdAt: string; decidedAt: string | null; decidedBy: string | null };
type Student = { studentId: string; roll: string; name: string; totalPct: number; grade: string; gradeChanged: boolean };

const STATUS: Record<string, { text: string; cls: string; tip: string }> = {
  DRAFT: { text: "Not submitted", cls: "badge-neutral", tip: "Enter every student's marks and set the grade cutoffs, then submit the result for approval." },
  RETURNED: { text: "Returned — needs changes", cls: "badge-no", tip: "Fix what the note asks, then submit again." },
  SUBMITTED: { text: "Waiting for approval", cls: "badge-warn", tip: "Marks and cutoffs are locked while it is reviewed. Withdraw it if you need to change something." },
  APPROVED: { text: "Approved — locked", cls: "badge-ok", tip: "Marks and cutoffs are locked. A grade can only change through a grade change request." },
};

export default function ResultApprovalPanel({ courseId, status, note, submittedAt, decidedAt, decidedBy, live, students, letters, requests }: {
  courseId: string; status: string; note: string | null; submittedAt: string | null; decidedAt: string | null; decidedBy: string | null;
  live: { students: number; withMarks: number; mean: number; passRate: number; distribution: Record<string, number>; cutoffsSet: boolean };
  students: Student[]; letters: string[]; requests: Req[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [gc, setGc] = useState({ studentId: "", newGrade: "", reason: "" });
  const st = STATUS[status] || STATUS.DRAFT;
  const missing = live.students - live.withMarks;

  async function post(url: string, body: unknown) {
    setBusy(true); setError("");
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setError(d.error || "Something went wrong."); return false; }
    router.refresh(); return true;
  }
  const day = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "");
  const sel = students.find((s) => s.studentId === gc.studentId);

  return (
    <div className="card" style={{ borderLeft: `4px solid ${status === "APPROVED" ? "var(--sage)" : status === "RETURNED" ? "var(--rust)" : status === "SUBMITTED" ? "#B7791F" : "var(--line)"}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h3 style={{ fontSize: 15, margin: 0 }}>Course result</h3>
        <span className={`badge ${st.cls}`} title={st.tip}>{st.text}</span>
        <span style={{ fontSize: 12, color: "var(--slate)" }}>
          {status === "SUBMITTED" && submittedAt && `submitted ${day(submittedAt)}`}
          {(status === "APPROVED" || status === "RETURNED") && decidedAt && `${status === "APPROVED" ? "approved" : "returned"} by ${decidedBy || "—"} on ${day(decidedAt)}`}
        </span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {(status === "DRAFT" || status === "RETURNED") && (
            <button className="btn btn-brass" disabled={busy || missing > 0 || live.students === 0} title={missing > 0 ? `Marks missing for ${missing} student(s)` : ""}
              onClick={() => confirm("Submit this result for approval? Marks and grade cutoffs will be locked while it is reviewed.") && post(`/api/instructor/courses/${courseId}/result`, { action: "submit" })}>
              {busy ? "Working…" : "Submit result for approval"}
            </button>
          )}
          {status === "SUBMITTED" && <button className="btn" disabled={busy} onClick={() => post(`/api/instructor/courses/${courseId}/result`, { action: "withdraw" })}>Withdraw submission</button>}
        </span>
      </div>
      <p style={{ fontSize: 12.5, color: "var(--slate)", margin: "8px 0 0" }}>
        {live.students} students · marks entered for {live.withMarks}{missing > 0 ? <b style={{ color: "var(--rust)" }}> ({missing} missing)</b> : null} · mean {live.mean}% · pass rate {live.passRate}% ·{" "}
        {Object.entries(live.distribution).sort().map(([g, n]) => `${g}: ${n}`).join("  ")}
        {!live.cutoffsSet && status !== "APPROVED" ? <span style={{ color: "#95650F" }}> · grade cutoffs not saved yet (suggested ones are being used)</span> : null}
      </p>
      {status === "RETURNED" && note && <p style={{ fontSize: 13, background: "#FBEAEA", color: "#8A1C1C", padding: "8px 12px", margin: "10px 0 0" }}><b>Returned:</b> {note}</p>}
      {status === "APPROVED" && note && <p style={{ fontSize: 12.5, color: "var(--slate)", margin: "8px 0 0" }}>Approver&apos;s note: {note}</p>}
      {error && <div className="err" style={{ marginTop: 10 }}>{error}</div>}

      {status === "APPROVED" && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
          <h4 style={{ fontSize: 13.5, margin: "0 0 8px" }}>Request a grade change</h4>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
            <select value={gc.studentId} onChange={(e) => setGc({ ...gc, studentId: e.target.value })} style={{ minWidth: 240 }}>
              <option value="">Choose a student…</option>
              {students.map((s) => <option key={s.studentId} value={s.studentId}>{s.roll} — {s.name} ({s.grade}, {s.totalPct}%)</option>)}
            </select>
            <select value={gc.newGrade} onChange={(e) => setGc({ ...gc, newGrade: e.target.value })}>
              <option value="">New grade</option>
              {letters.filter((l) => l !== sel?.grade).map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
            <textarea value={gc.reason} onChange={(e) => setGc({ ...gc, reason: e.target.value })} placeholder="Reason, e.g. final exam Q4 was marked out of 10 instead of 15 — rechecked script attached to the course folder" rows={2} style={{ flex: "1 1 320px" }} />
            <button className="btn btn-brass" disabled={busy || !gc.studentId || !gc.newGrade || gc.reason.trim().length < 10}
              onClick={async () => { if (await post(`/api/instructor/courses/${courseId}/grade-change`, gc)) setGc({ studentId: "", newGrade: "", reason: "" }); }}>Send request</button>
          </div>
          <p style={{ fontSize: 11.5, color: "var(--slate)", margin: "6px 0 0" }}>The change takes effect only when the Chairman or Institute Head approves it. Every request and decision is kept on record.</p>
        </div>
      )}

      {requests.length > 0 && (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={{ fontSize: 12.5 }}>
            <thead><tr><th>Student</th><th>Change</th><th>Reason</th><th>Status</th></tr></thead>
            <tbody>{requests.map((r) => (
              <tr key={r.id}>
                <td>{r.roll} — {r.name}<div style={{ fontSize: 11, color: "var(--slate)" }}>asked {day(r.createdAt)}</div></td>
                <td style={{ whiteSpace: "nowrap" }}><b>{r.oldGrade}</b> → <b>{r.newGrade}</b></td>
                <td style={{ maxWidth: 320 }}>{r.reason}</td>
                <td><span className={`badge ${r.status === "APPROVED" ? "badge-ok" : r.status === "REJECTED" ? "badge-no" : "badge-warn"}`}>{r.status === "PENDING" ? "Waiting" : r.status === "APPROVED" ? "Approved" : "Rejected"}</span>
                  {r.decidedBy && <div style={{ fontSize: 11, color: "var(--slate)" }}>{r.decidedBy}, {day(r.decidedAt)}</div>}
                  {r.decisionNote && <div style={{ fontSize: 11, color: "var(--slate)" }}>{r.decisionNote}</div>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
