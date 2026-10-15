"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Topic = { topic: string; lectures: number[]; items: string[]; strong: boolean; below: number; assessed: number };
type Student = { id: string; name: string; rollNumber: string; pcts: (number | null)[] };

/**
 * Pick the topics most students did not attain; the students below the pass mark on any of them are proposed for
 * remediation. Then choose a tutorial or a junior class sitting, the teacher and the fee, and create the plan.
 */
export default function RemediationPlanner({ courseId, courseCode, topics, students, notes = {}, passPct, faculty, hosts }: {
  courseId: string; courseCode: string; topics: Topic[]; students: Student[]; notes?: Record<string, string>; passPct: number; faculty: [string, string][]; hosts: [string, string][];
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<number[]>(() => topics.map((t, i) => (t.assessed && t.below / t.assessed > 0.3) || (t.strong && t.below) ? i : -1).filter((i) => i >= 0));
  const below = (s: Student) => picked.some((i) => s.pcts[i] !== null && s.pcts[i]! < passPct);
  const candidates = useMemo(() => students.filter(below), [picked, students]); // eslint-disable-line react-hooks/exhaustive-deps
  const [chosen, setChosen] = useState<Set<string> | null>(null);
  // Students already in remediation for this course are listed but not ticked.
  const selected = chosen ?? new Set(candidates.filter((s) => !notes[s.id]).map((s) => s.id));
  const [f, setF] = useState({ kind: "TUTORIAL", title: "", instructorId: faculty[0]?.[0] || "", hostCourseId: hosts[0]?.[0] || "", schedule: "", startDate: "", feePerStudent: "2000", instructorSharePct: "70", assessmentTitle: "Micro-quiz" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const toggleTopic = (i: number) => { setPicked((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i])); setChosen(null); };
  const toggleStudent = (id: string) => { const n = new Set(selected); if (n.has(id)) n.delete(id); else n.add(id); setChosen(n); };

  async function create() {
    setErr("");
    if (!picked.length) { setErr("Choose at least one topic."); return; }
    if (!selected.size) { setErr("Choose at least one student."); return; }
    setBusy(true);
    const res = await fetch("/api/remediation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "createPlan", courseId, topics: picked.map((i) => topics[i].topic), studentIds: Array.from(selected), ...f }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(data.error || "Could not create the plan."); return; }
    router.push(`/remediation/${data.plan.id}`);
  }

  return (
    <div>
      <h3 style={{ marginTop: 0 }}>1. Topics to remediate</h3>
      <div style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th /><th>Topic</th><th>Lectures</th><th>Assessed by</th><th>Below {passPct}%</th></tr></thead>
          <tbody>{topics.map((t, i) => (
            <tr key={t.topic}>
              <td><input type="checkbox" checked={picked.includes(i)} onChange={() => toggleTopic(i)} aria-label={`Remediate ${t.topic}`} /></td>
              <td>{t.topic}{t.strong && <span className="badge badge-no" style={{ marginLeft: 6 }} title="A strong prerequisite of a later course: students below the mark can't register for it until they clear it">strong prerequisite</span>}</td>
              <td className="small-note">{t.lectures.join(", ")}</td>
              <td className="small-note">{t.items.slice(0, 4).join(", ")}{t.items.length > 4 ? "…" : ""}</td>
              <td><b style={{ color: t.assessed && t.below / t.assessed > 0.3 ? "var(--rust)" : undefined }}>{t.below}</b> of {t.assessed}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>

      <h3 style={{ marginTop: 18 }}>2. Students ({selected.size} of {candidates.length} below the mark on a chosen topic)</h3>
      {candidates.length === 0 ? <p className="small-note">No student is below {passPct}% on the chosen topics.</p> : (
        <div style={{ overflowX: "auto", maxHeight: 360, overflowY: "auto", border: "1px solid var(--line)", borderRadius: 8 }}>
          <table>
            <thead><tr><th /><th>Student</th>{picked.map((i) => <th key={i} style={{ whiteSpace: "nowrap" }}>{topics[i].topic.slice(0, 24)}</th>)}</tr></thead>
            <tbody>{candidates.map((s) => (
              <tr key={s.id}>
                <td><input type="checkbox" checked={selected.has(s.id)} onChange={() => toggleStudent(s.id)} aria-label={`Enrol ${s.name}`} /></td>
                <td>{s.name}<div className="small-note">{s.rollNumber}</div>{notes[s.id] && <div className="small-note" style={{ color: "var(--sage)" }}>{notes[s.id]}</div>}</td>
                {picked.map((i) => <td key={i} style={{ color: s.pcts[i] !== null && s.pcts[i]! < passPct ? "var(--rust)" : undefined }}>{s.pcts[i] ?? "—"}{s.pcts[i] !== null ? "%" : ""}</td>)}
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      <h3 style={{ marginTop: 18 }}>3. The plan</h3>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ fontSize: 12, display: "grid", gap: 3 }}>Pathway
          <select value={f.kind} onChange={(e) => set("kind", e.target.value)}>
            <option value="TUTORIAL">Dedicated remediation tutorial</option>
            <option value="JUNIOR_SITTING" disabled={!hosts.length}>Sit the lectures in a junior class{hosts.length ? "" : " (no offering running)"}</option>
          </select>
        </label>
        {f.kind === "JUNIOR_SITTING" && (
          <label style={{ fontSize: 12, display: "grid", gap: 3 }}>Junior offering
            <select value={f.hostCourseId} onChange={(e) => set("hostCourseId", e.target.value)} style={{ maxWidth: 320 }}>{hosts.map(([id, t]) => <option key={id} value={id}>{t}</option>)}</select>
          </label>
        )}
        <label style={{ fontSize: 12, display: "grid", gap: 3 }}>{f.kind === "TUTORIAL" ? "Tutorial teacher" : "Teacher who gives the micro-assessment"}
          <select value={f.instructorId} onChange={(e) => set("instructorId", e.target.value)} style={{ maxWidth: 300 }}>{faculty.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
        </label>
        <label style={{ fontSize: 12, display: "grid", gap: 3 }}>Title (optional)<input value={f.title} onChange={(e) => set("title", e.target.value)} placeholder={`${courseCode} remediation`} style={{ width: 220 }} /></label>
        <label style={{ fontSize: 12, display: "grid", gap: 3 }}>Starts<input type="date" value={f.startDate} onChange={(e) => set("startDate", e.target.value)} /></label>
        <label style={{ fontSize: 12, display: "grid", gap: 3 }}>Fee per student (PKR)<input type="number" min={0} value={f.feePerStudent} onChange={(e) => set("feePerStudent", e.target.value)} style={{ width: 120 }} /></label>
        <label style={{ fontSize: 12, display: "grid", gap: 3 }}>Teacher&apos;s share %<input type="number" min={0} max={100} value={f.instructorSharePct} onChange={(e) => set("instructorSharePct", e.target.value)} style={{ width: 90 }} /></label>
        <label style={{ fontSize: 12, display: "grid", gap: 3 }}>Micro-assessment<input value={f.assessmentTitle} onChange={(e) => set("assessmentTitle", e.target.value)} style={{ width: 160 }} /></label>
        <label style={{ fontSize: 12, display: "grid", gap: 3, flex: "1 1 100%" }}>Schedule and venue<textarea rows={2} value={f.schedule} onChange={(e) => set("schedule", e.target.value)} placeholder="e.g. Saturdays 10:00–12:00, Room 204, three sessions" /></label>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10 }}>
        <button type="button" className="btn btn-brass" disabled={busy} onClick={create}>{busy ? "Creating…" : `Create plan for ${selected.size} student(s)`}</button>
        {err && <span className="small-note" style={{ color: "var(--rust)" }}>{err}</span>}
      </div>
    </div>
  );
}
