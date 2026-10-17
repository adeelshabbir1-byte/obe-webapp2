"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { fypPost } from "./FypClient";

type Task = { id: string; studentId: string | null; text: string; status: string };
type Meeting = { id: string; heldAt: string; nextAt: string | null; feedback: string | null; attendance: { studentId: string; present: boolean }[]; tasks: Task[] };
const STATUS: Record<string, string> = { OPEN: "Open", DONE: "Done", PARTIAL: "Partly done", NOT_DONE: "Not done" };

// Supervisor meeting log: record attendance, feedback, tasks and the next date; review earlier tasks at the next meeting.
export default function FypMeetings({ groupId, members, meetings, canEdit, markPct }: { groupId: string; members: { id: string; name: string }[]; meetings: Meeting[]; canEdit: boolean; markPct: Record<string, number | null> }) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [heldAt, setHeldAt] = useState(today);
  const [nextAt, setNextAt] = useState(new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10));
  const [present, setPresent] = useState<Set<string>>(new Set(members.map((m) => m.id)));
  const [feedback, setFeedback] = useState("");
  const [tasks, setTasks] = useState<{ text: string; studentId: string }[]>([{ text: "", studentId: "" }]);
  const [msg, setMsg] = useState("");
  const name = (id: string | null) => (id ? members.find((m) => m.id === id)?.name || "?" : "Whole group");
  const open = meetings.flatMap((m) => m.tasks).filter((t) => t.status === "OPEN");
  async function save() {
    const r = await fypPost("/api/fyp/faculty", { action: "addMeeting", groupId, heldAt, nextAt, present: Array.from(present), feedback, tasks: tasks.filter((t) => t.text.trim()) });
    if (r.ok) { setMsg("Meeting saved."); setFeedback(""); setTasks([{ text: "", studentId: "" }]); router.refresh(); } else setMsg(r.error || "Could not save.");
  }
  async function review(taskId: string, status: string) { const r = await fypPost("/api/fyp/faculty", { action: "reviewTask", groupId, taskId, status }); if (r.ok) router.refresh(); else setMsg(r.error || "Could not save."); }
  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Supervisor meetings</h3>
      <p className="small-note" style={{ marginTop: 0 }}>Each meeting: attendance, feedback, tasks for the group or a student, and the next date. Tasks are marked done / partly / not done at the next meeting. Supervision mark = 20% attendance + 80% tasks completed. {members.map((m) => `${m.name}: ${markPct[m.id] ?? "—"}%`).join(" · ")}</p>
      {msg && <div className="small-note" style={{ color: "var(--sage)" }}>{msg}</div>}
      {canEdit && open.length > 0 && (
        <div style={{ background: "#FBF3E4", padding: 8, borderRadius: 8, marginBottom: 8 }}>
          <b style={{ fontSize: 13 }}>Tasks to review ({open.length})</b>
          {open.map((t) => <div key={t.id} style={{ fontSize: 12.5, marginTop: 4 }}>{t.text} <span className="small-note">({name(t.studentId)})</span> {["DONE", "PARTIAL", "NOT_DONE"].map((s) => <button key={s} className="act" style={{ marginLeft: 4 }} onClick={() => review(t.id, s)}>{STATUS[s]}</button>)}</div>)}
        </div>
      )}
      {canEdit && (
        <details style={{ marginBottom: 8 }}>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>Record a meeting</summary>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "6px 0", fontSize: 12.5 }}>
            <label>Held on <input type="date" value={heldAt} onChange={(e) => setHeldAt(e.target.value)} /></label>
            <label>Next meeting <input type="date" value={nextAt} onChange={(e) => setNextAt(e.target.value)} /></label>
          </div>
          <div style={{ fontSize: 12.5 }}>Present: {members.map((m) => <label key={m.id} style={{ marginRight: 10 }}><input type="checkbox" checked={present.has(m.id)} onChange={(e) => { const n = new Set(present); if (e.target.checked) n.add(m.id); else n.delete(m.id); setPresent(n); }} /> {m.name}</label>)}</div>
          <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={2} placeholder="Feedback" style={{ width: "100%", marginTop: 6 }} />
          {tasks.map((t, i) => <div key={i} style={{ display: "flex", gap: 6, marginTop: 4 }}><input value={t.text} onChange={(e) => setTasks(tasks.map((x, k) => (k === i ? { ...x, text: e.target.value } : x)))} placeholder={`Task ${i + 1}`} style={{ flex: 1 }} /><select value={t.studentId} onChange={(e) => setTasks(tasks.map((x, k) => (k === i ? { ...x, studentId: e.target.value } : x)))}><option value="">Whole group</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>)}
          <button className="act" style={{ marginTop: 4 }} onClick={() => setTasks([...tasks, { text: "", studentId: "" }])}>+ Task</button>{" "}
          <button className="btn btn-sm" style={{ marginTop: 6 }} onClick={save}>Save meeting</button>
        </details>
      )}
      {meetings.length === 0 ? <p className="small-note">No meetings recorded yet.</p> : meetings.map((m) => (
        <div key={m.id} style={{ borderTop: "1px solid var(--line)", padding: "6px 0", fontSize: 12.5 }}>
          <b>{m.heldAt.slice(0, 10)}</b>{m.nextAt && <span className="small-note"> · next {m.nextAt.slice(0, 10)}</span>} · present: {m.attendance.filter((a) => a.present).map((a) => name(a.studentId)).join(", ") || "none"}
          {m.feedback && <div>{m.feedback}</div>}
          {m.tasks.map((t) => <div key={t.id} className="small-note">• {t.text} ({name(t.studentId)}) — <b>{STATUS[t.status]}</b></div>)}
        </div>
      ))}
    </div>
  );
}
