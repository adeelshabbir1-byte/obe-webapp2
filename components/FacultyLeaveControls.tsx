"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Course = { id: string; code: string; title: string; batch: string; term: string; asInstructor: boolean; asExpert: boolean; planStatus: string };
const KINDS: [string, string][] = [["SEMESTER_LEAVE", "Semester leave"], ["STUDY_LEAVE", "Study leave (PhD / higher studies)"], ["SABBATICAL", "Sabbatical"], ["MEDICAL", "Long medical leave"], ["LEFT", "Left the institute"]];

export function LeaveForm({ people, terms, currentTerm }: { people: { id: string; name: string; department: string | null }[]; terms: { value: number; label: string }[]; currentTerm: number | null }) {
  const router = useRouter();
  const [f, setF] = useState({ userId: "", kind: "SEMESTER_LEAVE", fromTerm: String(currentTerm ?? terms[0]?.value ?? ""), toTerm: String(currentTerm ?? terms[0]?.value ?? ""), allowDesign: false, disableLogin: true, note: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ id: string; affected: Course[] } | null>(null);
  const left = f.kind === "LEFT";
  async function save() {
    setBusy(true); setError("");
    const r = await fetch("/api/faculty-leave", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, toTerm: left ? null : f.toTerm }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setError(d.error || "Could not save."); return; }
    setResult({ id: d.id, affected: d.affected || [] });
    router.refresh();
  }
  if (result) return (
    <div>
      <p style={{ background: "#E8F3EC", color: "#1F5E36", padding: "8px 12px", fontSize: 13 }}>Leave recorded. {result.affected.length ? `They still hold ${result.affected.length} course(s) in those semesters:` : "They hold no courses in those semesters."}</p>
      {result.affected.length > 0 && <RevokeList leaveId={result.id} courses={result.affected} />}
      <button className="btn" style={{ marginTop: 10 }} onClick={() => setResult(null)}>Record another</button>
    </div>
  );
  return (
    <div>
      {error && <div className="err">{error}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        <div className="field"><label>Teacher</label><select value={f.userId} onChange={(e) => setF({ ...f, userId: e.target.value })}><option value="">Choose…</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}{p.department ? ` — ${p.department}` : ""}</option>)}</select></div>
        <div className="field"><label>Kind</label><select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <div className="field"><label>{left ? "Last taught before" : "From semester"}</label><select value={f.fromTerm} onChange={(e) => setF({ ...f, fromTerm: e.target.value, toTerm: Number(e.target.value) > Number(f.toTerm) ? e.target.value : f.toTerm })}>{terms.map((t) => <option key={t.value} value={t.value}>{left ? `from ${t.label}` : t.label}</option>)}</select></div>
        {!left && <div className="field"><label>To semester</label><select value={f.toTerm} onChange={(e) => setF({ ...f, toTerm: e.target.value })}>{terms.filter((t) => t.value >= Number(f.fromTerm)).map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}<option value="">open-ended</option></select></div>}
      </div>
      {!left && <label style={{ fontSize: 12.5, display: "flex", gap: 6, marginBottom: 8 }}><input type="checkbox" checked={f.allowDesign} onChange={(e) => setF({ ...f, allowDesign: e.target.checked })} /> May still build course plans as a Subject Expert while away (e.g. on study leave)</label>}
      {left && <label style={{ fontSize: 12.5, display: "flex", gap: 6, marginBottom: 8 }}><input type="checkbox" checked={f.disableLogin} onChange={(e) => setF({ ...f, disableLogin: e.target.checked })} /> Stop their login (their records stay)</label>}
      <div className="field"><label>Note</label><input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="e.g. PhD at NUST, approved by BoG 14 Sep" /></div>
      <button className="btn btn-brass" disabled={busy || !f.userId} onClick={save}>{busy ? "Saving…" : "Record"}</button>
    </div>
  );
}

export function RevokeList({ leaveId, courses }: { leaveId: string; courses: Course[] }) {
  const router = useRouter();
  const [pick, setPick] = useState<string[]>(courses.map((c) => c.id));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function go() {
    if (!confirm(`Take ${pick.length} course(s) back? Lectures already taught stay on record with a handover note, and the Program Lead is asked to assign someone else.`)) return;
    setBusy(true); setMsg("");
    const r = await fetch(`/api/faculty-leave/${leaveId}/revoke`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseIds: pick }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    setMsg(r.ok ? `${d.revoked} course(s) taken back.` : d.error || "Could not do it.");
    router.refresh();
  }
  return (
    <div>
      <table style={{ fontSize: 12.5 }}>
        <thead><tr><th></th><th>Course</th><th>Semester</th><th>As</th></tr></thead>
        <tbody>{courses.map((c) => (
          <tr key={c.id}>
            <td><input type="checkbox" checked={pick.includes(c.id)} onChange={(e) => setPick(e.target.checked ? [...pick, c.id] : pick.filter((x) => x !== c.id))} /></td>
            <td><b>{c.code}</b> {c.title}<div style={{ fontSize: 11, color: "var(--slate)" }}>{c.batch}</div></td>
            <td>{c.term}</td>
            <td>{[c.asInstructor ? "Instructor" : "", c.asExpert ? `Subject Expert${c.planStatus !== "draft" ? ` (plan ${c.planStatus})` : ""}` : ""].filter(Boolean).join(" + ")}</td>
          </tr>
        ))}</tbody>
      </table>
      <button className="btn btn-brass" style={{ marginTop: 8 }} disabled={busy || !pick.length} onClick={go}>{busy ? "Working…" : `Take back ${pick.length} course(s)`}</button>
      {msg && <span style={{ marginLeft: 10, fontSize: 12.5 }}>{msg}</span>}
    </div>
  );
}

export function EndLeave({ id, left }: { id: string; left: boolean }) {
  const router = useRouter();
  return <button className="btn" style={{ fontSize: 12 }} onClick={async () => { if (!confirm(left ? "They rejoined? Their login is turned back on and courses can be given to them again." : "End this leave now? Courses can be given to them again.")) return; await fetch(`/api/faculty-leave/${id}/end`, { method: "POST" }); router.refresh(); }}>{left ? "Rejoined" : "Back early"}</button>;
}
