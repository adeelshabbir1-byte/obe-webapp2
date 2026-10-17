"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Stu = { id: string; name: string; rollNumber: string };
type Pick = (Stu & { score: number }) | null;
type Item = { id: string; label: string; type: string; maxScore: number; clos: string[]; scored: number; suggest: Record<string, Pick>; samples: { id: string; level: string; score: number | null; fileName: string; fileUrl: string; student?: Stu }[] };
const LV: [string, string][] = [["HIGH", "Best"], ["MEDIUM", "Average"], ["LOW", "Weakest"]];

/** Per assessment: the suggested best / average / weakest student and an upload slot for each scanned script. */
export default function WorkSamples({ courseId, items, students }: { courseId: string; items: Item[]; students: Stu[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  async function upload(instrumentId: string, level: string, studentId: string, file: File | undefined) {
    if (!file) return;
    if (!studentId) { setMsg("Choose the student first."); return; }
    setBusy(instrumentId + level); setMsg("");
    const fd = new FormData(); fd.set("file", file); fd.set("instrumentId", instrumentId); fd.set("level", level); fd.set("studentId", studentId);
    const r = await fetch(`/api/instructor/courses/${courseId}/samples`, { method: "POST", body: fd });
    const d = await r.json().catch(() => ({})); setBusy("");
    if (!r.ok) setMsg(d.error || "Upload failed."); else router.refresh();
  }
  async function remove(id: string) { await fetch(`/api/instructor/courses/${courseId}/samples?id=${id}`, { method: "DELETE" }); router.refresh(); }
  const done = items.filter((i) => LV.every(([l]) => i.samples.some((s) => s.level === l))).length;
  return (
    <div>
      <p className="small-note">Accreditation reviewers ask for the best, an average and the weakest script of every assessment, by CLO. The system suggests the students from your marks; upload their scanned scripts. {done}/{items.length} assessments complete.</p>
      {msg && <div className="err">{msg}</div>}
      {items.map((i) => (
        <div key={i.id} className="card">
          <b>{i.label}</b> <span className="small-note">{i.type} · /{i.maxScore} · {i.clos.length ? i.clos.join(", ") : "no CLO linked"} · {i.scored} marked</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 8, marginTop: 6 }}>
            {LV.map(([l, name]) => {
              const have = i.samples.filter((s) => s.level === l); const sug = i.suggest[l];
              return (
                <div key={l} style={{ border: "1px solid #D5DCE4", borderRadius: 8, padding: 8, fontSize: 13 }}>
                  <div style={{ fontWeight: 700 }}>{name}</div>
                  {have.map((s) => <div key={s.id}><a href={s.fileUrl} target="_blank" rel="noopener noreferrer">{s.fileName}</a> <span className="small-note">{s.student?.rollNumber} · {s.score ?? "—"}</span> <button type="button" className="btn btn-secondary btn-sm" onClick={() => remove(s.id)}>Remove</button></div>)}
                  {!have.length && <SlotForm students={students} sug={sug} busy={busy === i.id + l} onUpload={(sid, f) => upload(i.id, l, sid, f)} />}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {!items.length && <p className="small-note">Add assessments first.</p>}
    </div>
  );
}

function SlotForm({ students, sug, busy, onUpload }: { students: Stu[]; sug: Pick; busy: boolean; onUpload: (sid: string, f: File | undefined) => void }) {
  const [sid, setSid] = useState(sug?.id || "");
  return (
    <div>
      {sug ? <div className="small-note">Suggested: {sug.name} ({sug.score})</div> : <div className="small-note">No marks yet.</div>}
      <select value={sid} onChange={(e) => setSid(e.target.value)} style={{ width: "100%", margin: "4px 0" }}><option value="">— student —</option>{students.map((s) => <option key={s.id} value={s.id}>{s.rollNumber} {s.name}</option>)}</select>
      <input type="file" accept=".pdf,image/*" disabled={busy} onChange={(e) => onUpload(sid, e.target.files?.[0])} />
      {busy && <span className="small-note">Uploading…</span>}
    </div>
  );
}
