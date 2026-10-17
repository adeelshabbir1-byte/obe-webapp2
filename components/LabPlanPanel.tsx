"use client";
import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";

type Lecture = { lectureNumber: number; week: number; topic: string };
type TopicRef = { lectureNumber: number; topic: string };
type Task = { labNumber: number; title: string; week: number | null; topics: TopicRef[]; openEnded?: boolean; oelBrief?: string | null };
type File = { versionId: string; version: number; labNumber: number; kind: "MANUAL" | "SOLUTION"; fileName: string; fileUrl: string; note: string | null; by: string; at: string; status: string; reviewNote: string | null; reviewedBy: string | null };
type Issue = { level: "bad" | "warn"; labNumber: number | null; text: string };

const input = { padding: "5px 7px", border: "1px solid var(--line)", borderRadius: 6 } as const;
const STATUS: Record<string, { t: string; c: string }> = { APPROVED: { t: "Approved", c: "#2E7D4F" }, PENDING: { t: "Waiting for review", c: "#B7791F" }, RETURNED: { t: "Sent back", c: "#B3261E" } };
const norm = (t: string) => (t || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9+#]+/g, " ").trim();

export default function LabPlanPanel({ labCourseId, as, theoryCode, lectures, tasks, files, issues }: { labCourseId: string; as: "ENGINEER" | "LEAD"; theoryCode: string | null; lectures: Lecture[]; tasks: Task[]; files: File[]; issues: Issue[] }) {
  const router = useRouter();
  const lead = as === "LEAD";
  const [edit, setEdit] = useState<{ labNumber: string; title: string; week: string; lectures: number[]; openEnded: boolean; oelBrief: string } | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const nextNo = (tasks.reduce((m, t) => Math.max(m, t.labNumber), 0) || 0) + 1;
  const where = (r: TopicRef) => lectures.find((l) => norm(l.topic) === norm(r.topic)) || null;
  const latest = (n: number, k: string) => files.find((f) => f.labNumber === n && f.kind === k) || null;

  async function call(body: Record<string, unknown>, ok: string) {
    setBusy(true); setMsg(null);
    const res = await fetch("/api/lab/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ labCourseId, ...body }) });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    setMsg(res.ok ? { ok: true, text: ok } : { ok: false, text: d.error || "Something went wrong" });
    if (res.ok) router.refresh();
    return res.ok;
  }
  async function save() {
    if (!edit) return;
    if (await call({ action: "saveTask", labNumber: edit.labNumber, title: edit.title, week: edit.week, lectureNumbers: edit.lectures, openEnded: edit.openEnded, oelBrief: edit.oelBrief }, `Lab ${edit.labNumber} saved. ${lead ? "The Lab Engineer" : "The instructor"} is told about any change.`)) setEdit(null);
  }
  async function upload(e: React.FormEvent<HTMLFormElement>, labNumber: number, title: string) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const fd = new FormData(e.currentTarget);
    fd.set("courseId", labCourseId); fd.set("labNumber", String(labNumber)); fd.set("title", title);
    const res = await fetch("/api/lab/manuals", { method: "POST", body: fd });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    setMsg(res.ok ? { ok: true, text: `Uploaded as version ${d.version}.${lead ? "" : " The instructor has been asked to review it."}` } : { ok: false, text: d.error || "Upload failed" });
    if (res.ok) { (e.target as HTMLFormElement).reset(); router.refresh(); }
  }

  const weeks = Array.from(new Set([...lectures.map((l) => l.week), ...tasks.map((t) => t.week).filter((w): w is number => w != null)])).sort((a, b) => a - b);
  const bad = issues.filter((i) => i.level === "bad").length;

  return (
    <div>
      {msg && <div className="card" style={{ borderLeft: `4px solid ${msg.ok ? "#2e7d32" : "#c62828"}`, fontSize: 13 }}>{msg.text}</div>}

      <div className="card" style={{ borderLeft: `4px solid ${bad ? "#B3261E" : issues.length ? "#B7791F" : "#2E7D4F"}` }}>
        <h3 style={{ marginTop: 0 }}>Lab plan in step with {theoryCode ? `${theoryCode} lectures` : "the lectures"}</h3>
        <p style={{ fontSize: 12.5, color: "var(--slate)", marginTop: 0 }}>
          Before the semester starts the Lab Engineer names each lab task, sets its week, links it to the lecture topics it practises and uploads its manual and solution (Word files). The instructor who teaches the course reviews and approves them. If the lecture plan or the lab plan changes later (a topic renamed or removed, a lecture or lab moved to another week), both of you are told. Solutions are never shown to students.
        </p>
        {issues.length === 0 ? <div style={{ fontSize: 13, color: "#2E7D4F" }}>✓ Every lab task comes after the lecture that teaches its topics.</div> : (
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>{issues.map((i, k) => <li key={k} style={{ color: i.level === "bad" ? "#B3261E" : "#8a5a00" }}>{i.text}</li>)}</ul>
        )}
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0 }}>Lab tasks</h3>
          {!edit && <button className="btn btn-brass" onClick={() => setEdit({ labNumber: String(nextNo), title: "", week: "", lectures: [], openEnded: false, oelBrief: "" })}>Add a lab task</button>}
        </div>
        {edit && (
          <div style={{ border: "1px dashed var(--line)", borderRadius: 8, padding: 10, margin: "10px 0" }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
              <label style={{ fontSize: 12 }}>Lab no.<br /><input style={{ ...input, width: 60 }} type="number" min={1} max={40} value={edit.labNumber} onChange={(e) => setEdit({ ...edit, labNumber: e.target.value })} /></label>
              <label style={{ fontSize: 12 }}>Lab task name<br /><input style={{ ...input, width: 280 }} placeholder="e.g. Implementing a stack with arrays" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></label>
              <label style={{ fontSize: 12 }}>Week<br /><input style={{ ...input, width: 60 }} type="number" min={1} max={20} value={edit.week} onChange={(e) => setEdit({ ...edit, week: e.target.value })} /></label>
            </div>
            <div style={{ fontSize: 12, margin: "8px 0 4px" }}>Lecture topics this lab practises {lectures.length === 0 && <span style={{ color: "var(--slate)" }}>(the theory course has no lecture plan yet)</span>}</div>
            <div style={{ maxHeight: 220, overflowY: "auto", border: "1px solid var(--line)", borderRadius: 6, padding: 6, fontSize: 12.5 }}>
              {lectures.map((l) => {
                const on = edit.lectures.includes(l.lectureNumber);
                const late = on && edit.week !== "" && Number(edit.week) < l.week;
                return (
                  <label key={l.lectureNumber} style={{ display: "block", padding: "2px 0", color: late ? "#B3261E" : undefined }}>
                    <input type="checkbox" checked={on} onChange={() => setEdit({ ...edit, lectures: on ? edit.lectures.filter((x) => x !== l.lectureNumber) : [...edit.lectures, l.lectureNumber] })} /> Week {l.week} · Lecture {l.lectureNumber}: {l.topic}{late ? " — after this lab's week" : ""}
                  </label>
                );
              })}
            </div>
            <label style={{ display: "block", fontSize: 12.5, marginTop: 8 }}><input type="checkbox" checked={edit.openEnded} onChange={(e) => setEdit({ ...edit, openEnded: e.target.checked })} /> Open-ended lab — students design their own solution to a loosely defined problem (PEC)</label>
            {edit.openEnded && <textarea style={{ ...input, width: "100%", marginTop: 4 }} rows={2} placeholder="The open problem students are given, and how it is assessed (rubric)" value={edit.oelBrief} onChange={(e) => setEdit({ ...edit, oelBrief: e.target.value })} />}
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button className="btn btn-brass" disabled={busy || !edit.title.trim()} onClick={save}>Save lab task</button>
              <button className="btn" onClick={() => setEdit(null)}>Cancel</button>
            </div>
          </div>
        )}
        {tasks.length === 0 ? <p style={{ color: "var(--slate)", fontSize: 13 }}>No lab task yet.</p> : (
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead><tr><th>Lab</th><th>Task</th><th>Week</th><th>Lecture topics it practises</th><th>Manual</th><th>Solution</th><th></th></tr></thead>
              <tbody>{tasks.map((t) => {
                const m = latest(t.labNumber, "MANUAL"), s = latest(t.labNumber, "SOLUTION");
                const mine = files.filter((f) => f.labNumber === t.labNumber);
                return (
                  <Fragment key={t.labNumber}>
                    <tr>
                      <td><b>{t.labNumber}</b></td>
                      <td>{t.title}{t.openEnded && <span className="pill" style={{ fontSize: 10.5, marginLeft: 6 }} title={t.oelBrief || ""}>open-ended</span>}</td>
                      <td>{t.week ?? <span style={{ color: "#B7791F" }}>—</span>}</td>
                      <td style={{ fontSize: 12 }}>{t.topics.length === 0 ? <span style={{ color: "#B7791F" }}>not linked</span> : t.topics.map((r, k) => {
                        const l = where(r);
                        const off = !l || (t.week != null && t.week < l.week);
                        return <div key={k} style={{ color: off ? "#B3261E" : undefined }}>{l ? `L${l.lectureNumber} (wk ${l.week}): ${l.topic}` : `${r.topic} — no longer in the lecture plan`}</div>;
                      })}</td>
                      {[m, s].map((f, k) => <td key={k} style={{ fontSize: 12 }}>{f ? <><a href={f.fileUrl} target="_blank" rel="noreferrer" style={{ color: "var(--brass-dark)" }}>v{f.version}</a> <span style={{ color: STATUS[f.status]?.c }}>{STATUS[f.status]?.t || f.status}</span></> : <span style={{ color: "#B3261E" }}>missing</span>}</td>)}
                      <td style={{ whiteSpace: "nowrap" }}>
                        <button className="act" onClick={() => setEdit({ labNumber: String(t.labNumber), title: t.title, week: t.week == null ? "" : String(t.week), lectures: t.topics.map((r) => where(r)?.lectureNumber || r.lectureNumber), openEnded: !!t.openEnded, oelBrief: t.oelBrief || "" })}>Edit</button>{" "}
                        <button className="act" onClick={() => setOpen(open === t.labNumber ? null : t.labNumber)}>Files{mine.some((f) => f.status === "PENDING") && lead ? " •" : ""}</button>{" "}
                        {mine.length === 0 && <button className="act" onClick={() => confirm(`Remove Lab ${t.labNumber}?`) && call({ action: "removeTask", labNumber: t.labNumber }, `Lab ${t.labNumber} removed.`)}>Remove</button>}
                      </td>
                    </tr>
                    {open === t.labNumber && (
                      <tr><td colSpan={7} style={{ background: "rgba(0,0,0,0.025)" }}>
                        <form onSubmit={(e) => upload(e, t.labNumber, t.title)} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 8 }}>
                          <label style={{ fontSize: 12 }}>File is the<br /><select name="kind" style={input}><option value="MANUAL">Lab manual</option><option value="SOLUTION">Solution</option></select></label>
                          <label style={{ fontSize: 12 }}>Word file<br /><input name="file" type="file" accept=".doc,.docx" required /></label>
                          <label style={{ fontSize: 12 }}>What changed (optional)<br /><input name="note" style={{ ...input, width: 200 }} /></label>
                          <button className="btn btn-brass" disabled={busy}>{busy ? "Uploading…" : "Upload"}</button>
                        </form>
                        {mine.length === 0 ? <div style={{ fontSize: 12.5, color: "var(--slate)" }}>No file yet.</div> : (
                          <table style={{ fontSize: 12.5 }}>
                            <tbody>{mine.map((f) => (
                              <tr key={f.versionId}>
                                <td>{f.kind === "SOLUTION" ? "Solution" : "Manual"} v{f.version}</td>
                                <td><a href={f.fileUrl} target="_blank" rel="noreferrer" style={{ color: "var(--brass-dark)" }}>{f.fileName}</a><div style={{ color: "var(--slate)", fontSize: 11.5 }}>{f.by} · {f.at}{f.note ? ` · ${f.note}` : ""}</div></td>
                                <td><span style={{ color: STATUS[f.status]?.c }}>{STATUS[f.status]?.t || f.status}</span>{f.reviewedBy && <div style={{ color: "var(--slate)", fontSize: 11.5 }}>{f.reviewedBy}{f.reviewNote ? `: ${f.reviewNote}` : ""}</div>}</td>
                                <td>{lead && f.status !== "APPROVED" && (
                                  <span style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                                    <button className="act act-primary" disabled={busy} onClick={() => call({ action: "review", versionId: f.versionId, decision: "APPROVED", note: notes[f.versionId] || "" }, "Approved. The Lab Engineer has been told.")}>Approve</button>
                                    <input style={{ ...input, width: 180 }} placeholder="What needs to change" value={notes[f.versionId] || ""} onChange={(e) => setNotes({ ...notes, [f.versionId]: e.target.value })} />
                                    <button className="act" disabled={busy} onClick={() => call({ action: "review", versionId: f.versionId, decision: "RETURNED", note: notes[f.versionId] || "" }, "Sent back to the Lab Engineer.")}>Send back</button>
                                  </span>
                                )}</td>
                              </tr>
                            ))}</tbody>
                          </table>
                        )}
                      </td></tr>
                    )}
                  </Fragment>
                );
              })}</tbody>
            </table>
          </div>
        )}
      </div>

      {weeks.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Week by week</h3>
          <div style={{ overflowX: "auto" }}>
            <table style={{ fontSize: 12.5 }}>
              <thead><tr><th>Week</th><th>Lectures ({theoryCode || "theory"})</th><th>Lab tasks</th></tr></thead>
              <tbody>{weeks.map((w) => (
                <tr key={w}>
                  <td><b>{w}</b></td>
                  <td>{lectures.filter((l) => l.week === w).map((l) => <div key={l.lectureNumber}>L{l.lectureNumber}: {l.topic}</div>)}</td>
                  <td>{tasks.filter((t) => t.week === w).map((t) => {
                    const off = t.topics.some((r) => { const l = where(r); return !l || l.week > w; });
                    return <div key={t.labNumber} style={{ color: off ? "#B3261E" : undefined }}>Lab {t.labNumber}: {t.title}{off ? " — out of step" : ""}</div>;
                  })}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
