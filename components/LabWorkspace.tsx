"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Version = { version: number; fileName: string; fileUrl: string; note: string | null; by: string; at: string };
type Manual = { labNumber: number; title: string; versions: Version[] };
type Student = { id: string; name: string; rollNumber: string };
type Mark = { studentId: string; labNumber: number; score: number; maxScore: number };
type Instrument = { id: string; name: string; maxScore: number };

export default function LabWorkspace({ courseId, as, manuals, students, marks, instruments, theoryCode }: {
  courseId: string; as: "ENGINEER" | "LEAD"; manuals: Manual[]; students: Student[]; marks: Mark[]; instruments: Instrument[]; theoryCode: string | null;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const engineer = as === "ENGINEER";

  const labNumbers = Array.from(new Set<number>([...manuals.map((m) => m.labNumber), ...marks.map((m) => m.labNumber)])).sort((a, b) => a - b);
  const [gridLab, setGridLab] = useState<number>(labNumbers[0] || 1);
  const maxFor = (n: number) => marks.find((m) => m.labNumber === n)?.maxScore ?? 10;
  const [maxScore, setMaxScore] = useState<string>(String(maxFor(gridLab)));
  const [entries, setEntries] = useState<Record<string, string>>({});
  const current = (sid: string) => {
    if (sid in entries) return entries[sid];
    const m = marks.find((x) => x.studentId === sid && x.labNumber === gridLab);
    return m ? String(m.score) : "";
  };
  function pickLab(n: number) { setGridLab(n); setEntries({}); setMaxScore(String(maxFor(n))); }

  async function upload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const fd = new FormData(e.currentTarget);
    fd.set("courseId", courseId);
    const res = await fetch("/api/lab/manuals", { method: "POST", body: fd });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMsg({ ok: false, text: d.error || "Upload failed" }); return; }
    setMsg({ ok: true, text: `Saved as version ${d.version}.` });
    (e.target as HTMLFormElement).reset();
    router.refresh();
  }
  async function saveMarks() {
    setBusy(true); setMsg(null);
    const body = { courseId, labNumber: gridLab, maxScore, marks: students.map((s) => ({ studentId: s.id, score: current(s.id) === "" ? null : current(s.id) })) };
    const res = await fetch("/api/lab/marks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMsg({ ok: false, text: d.error || "Could not save" }); return; }
    setMsg({ ok: true, text: `Saved marks for Lab ${gridLab} (${d.saved} students).` });
    setEntries({}); router.refresh();
  }
  async function importMarks(instrumentId: string) {
    if (!confirm("Bring the lab marks into this theory course? Any marks already in that Lab item will be replaced.")) return;
    setBusy(true); setMsg(null);
    const res = await fetch("/api/lab/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ labCourseId: courseId, instrumentId }) });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    setMsg(res.ok ? { ok: true, text: `Imported marks for ${d.imported} students${d.skipped ? ` (${d.skipped} lab students are not in the theory course and were skipped)` : ""}.` } : { ok: false, text: d.error || "Import failed" });
  }

  return (
    <div>
      {msg && <div className="card" style={{ borderLeft: `4px solid ${msg.ok ? "#2e7d32" : "#c62828"}`, fontSize: 13 }}>{msg.text}</div>}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Lab manuals (Word files)</h3>
        <p style={{ fontSize: 12.5, color: "var(--slate)", marginTop: 0 }}>
          {engineer ? "Upload the manual of each lab. The course instructor can read it and upload an updated version." : "Read or download the manuals set by the Lab Engineer. You can upload an updated version; the older versions are kept."}
        </p>
        {manuals.length === 0 && <p style={{ color: "var(--slate)", fontSize: 13 }}>No manual has been uploaded yet.</p>}
        {manuals.map((m) => (
          <div key={m.labNumber} style={{ marginBottom: 10, fontSize: 13 }}>
            <b>Lab {m.labNumber}: {m.title}</b>
            <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
              {m.versions.map((v, i) => (
                <li key={v.version}>
                  <a href={v.fileUrl} target="_blank" rel="noreferrer" style={{ color: "var(--brass-dark)" }}>Version {v.version}{i === 0 ? " (latest)" : ""} — {v.fileName}</a>
                  <span style={{ color: "var(--slate)", fontSize: 12 }}> · {v.by} · {v.at}{v.note ? ` · ${v.note}` : ""}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <form onSubmit={upload} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginTop: 12 }}>
          <label style={{ fontSize: 12 }}>Lab no.<br /><input name="labNumber" type="number" min={1} max={40} required style={{ width: 70 }} /></label>
          <label style={{ fontSize: 12 }}>Title<br /><input name="title" placeholder="e.g. Introduction to Arduino" style={{ width: 220 }} /></label>
          <label style={{ fontSize: 12 }}>Word file<br /><input name="file" type="file" accept=".doc,.docx" required /></label>
          <label style={{ fontSize: 12 }}>What changed (optional)<br /><input name="note" style={{ width: 200 }} /></label>
          <button className="btn btn-brass" disabled={busy}>{busy ? "Uploading…" : "Upload"}</button>
        </form>
        <p style={{ fontSize: 11.5, color: "var(--slate)" }}>Using an existing lab number adds a new version of that lab’s manual.</p>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Lab marks</h3>
        {students.length === 0 ? <p style={{ color: "var(--slate)", fontSize: 13 }}>No students are enrolled in this lab yet.</p> : engineer ? (
          <>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end", marginBottom: 10, flexWrap: "wrap" }}>
              <label style={{ fontSize: 12 }}>Lab no.<br /><input type="number" min={1} max={40} value={gridLab} onChange={(e) => pickLab(parseInt(e.target.value, 10) || 1)} style={{ width: 70 }} /></label>
              <label style={{ fontSize: 12 }}>Marked out of<br /><input type="number" min={1} step="any" value={maxScore} onChange={(e) => setMaxScore(e.target.value)} style={{ width: 80 }} /></label>
              <button className="btn btn-brass" disabled={busy} onClick={saveMarks}>Save marks for Lab {gridLab}</button>
            </div>
            <table>
              <thead><tr><th>Roll no.</th><th>Student</th><th>Lab {gridLab} mark</th></tr></thead>
              <tbody>{students.map((s) => (
                <tr key={s.id}><td>{s.rollNumber}</td><td>{s.name}</td>
                  <td><input type="number" min={0} step="any" value={current(s.id)} onChange={(e) => setEntries({ ...entries, [s.id]: e.target.value })} style={{ width: 80 }} /></td></tr>
              ))}</tbody>
            </table>
          </>
        ) : (
          <table>
            <thead><tr><th>Roll no.</th><th>Student</th>{labNumbers.map((n) => <th key={n}>Lab {n}<div style={{ fontWeight: 400, fontSize: 11 }}>/{maxFor(n)}</div></th>)}</tr></thead>
            <tbody>{students.map((s) => (
              <tr key={s.id}><td>{s.rollNumber}</td><td>{s.name}</td>
                {labNumbers.map((n) => <td key={n}>{marks.find((m) => m.studentId === s.id && m.labNumber === n)?.score ?? "—"}</td>)}</tr>
            ))}</tbody>
          </table>
        )}
      </div>

      {!engineer && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Use lab marks in {theoryCode || "the theory course"}</h3>
          <p style={{ fontSize: 12.5, color: "var(--slate)", marginTop: 0 }}>
            If your institute gives part of the theory course marks to the lab, bring the total of all lab sessions into one Lab item of your theory course. Each student’s lab total is scaled to that item’s maximum.
          </p>
          {instruments.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--slate)" }}>Your theory course has no Lab item yet. Add an assessment of type “Lab” in your theory course first, then come back.</p>
          ) : instruments.map((i) => (
            <div key={i.id} style={{ marginBottom: 6 }}>
              <button className="btn" disabled={busy} onClick={() => importMarks(i.id)}>Import into “{i.name}” (out of {i.maxScore})</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
