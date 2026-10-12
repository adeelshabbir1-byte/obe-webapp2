"use client";

import { useState } from "react";

type Row = { courseType: string; midterm: number; final: number };

/** On the OMC's Weight Policy page: minimum number of questions in the Midterm and Final papers, per course type. */
export default function ExamQuestionPolicyEditor({ initial, missing }: { initial: Row[]; missing: boolean }) {
  const [rows, setRows] = useState(initial.map((r) => ({ ...r, saved: true })));
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (t: string, k: "midterm" | "final", v: string) => setRows((p) => p.map((r) => (r.courseType === t ? { ...r, [k]: Math.max(0, Math.min(50, parseInt(v || "0", 10) || 0)), saved: false } : r)));
  async function save(r: Row) {
    setBusy(r.courseType); setMsg(null);
    const res = await fetch("/api/omc/exam-question-policy", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseType: r.courseType, midtermMinQuestions: r.midterm, finalMinQuestions: r.final }) });
    const d = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) { setMsg({ ok: false, text: d.error || "Could not save." }); return; }
    setRows((p) => p.map((x) => (x.courseType === r.courseType ? { ...x, saved: true } : x)));
    setMsg({ ok: true, text: `Saved for ${r.courseType}.` });
  }
  return (
    <div className="card" style={{ overflowX: "auto" }}>
      <h3 style={{ marginTop: 0, marginBottom: 4 }}>Minimum questions per exam paper</h3>
      <p style={{ fontSize: 12.5, color: "var(--slate)", marginTop: 0 }}>
        How many questions the Midterm and Final papers must have at least (0 = no rule). The Subject Expert can&apos;t submit a course plan
        whose paper distribution has fewer, and the Instructor sees the same check on their own paper.
      </p>
      {missing && <div className="err">The exam question table is not in the database yet — run prisma/migration_exam_question_policy.sql (or the System Health fix script) in Supabase.</div>}
      {msg && <div className={msg.ok ? "" : "err"} style={msg.ok ? { background: "#E8F3EC", color: "#1F5E36", padding: "6px 10px", fontSize: 13, marginBottom: 8 } : undefined}>{msg.text}</div>}
      <table style={{ fontSize: 13 }}>
        <thead><tr><th>Course type</th><th>Midterm: min questions</th><th>Final: min questions</th><th></th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.courseType}>
              <td>{r.courseType}</td>
              <td><input type="number" min={0} max={50} value={r.midterm} onChange={(e) => set(r.courseType, "midterm", e.target.value)} style={{ width: 80 }} disabled={missing} /></td>
              <td><input type="number" min={0} max={50} value={r.final} onChange={(e) => set(r.courseType, "final", e.target.value)} style={{ width: 80 }} disabled={missing} /></td>
              <td><button className="btn" style={{ padding: "3px 12px" }} disabled={missing || busy === r.courseType || r.saved} onClick={() => save(r)}>{busy === r.courseType ? "Saving…" : r.saved ? "Saved" : "Save"}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
