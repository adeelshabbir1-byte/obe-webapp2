"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { COURSE_KINDS, DEADLINE_KINDS } from "../lib/deadlines";

type Person = { id: string; name: string; role: string };
type CourseOpt = { id: string; label: string; people: string[] };
const input = { padding: "6px 8px", border: "1px solid var(--line)" } as const;

export default function DeadlineForm({ people, courses }: { people: Person[]; courses: CourseOpt[] }) {
  const router = useRouter();
  const [f, setF] = useState({ assigneeId: people[0]?.id || "", kind: "CUSTOM", title: "", description: "", courseId: "", dueDate: "" });
  const [msg, setMsg] = useState(""); const [ok, setOk] = useState(false);
  const isCourse = COURSE_KINDS.includes(f.kind);
  const myCourses = courses.filter((c) => c.people.includes(f.assigneeId));
  async function add() {
    setMsg("");
    const res = await fetch("/api/deadlines", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, courseId: isCourse ? f.courseId : "" }) });
    const d = await res.json().catch(() => ({}));
    setOk(res.ok); setMsg(res.ok ? "Deadline set." : d.error || "Something went wrong");
    if (res.ok) { setF({ ...f, title: "", description: "", dueDate: "" }); router.refresh(); }
  }
  function pickKind(kind: string) { setF({ ...f, kind, courseId: "", title: kind === "CUSTOM" ? f.title : DEADLINE_KINDS[kind] }); }
  if (people.length === 0) return <div className="card" style={{ color: "var(--slate)" }}>There is nobody in your area to set a deadline for yet.</div>;
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <h3 style={{ marginTop: 0 }}>Set a deadline</h3>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
        <label style={{ fontSize: 12 }}>For<br /><select style={input} value={f.assigneeId} onChange={(e) => setF({ ...f, assigneeId: e.target.value, courseId: "" })}>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label style={{ fontSize: 12 }}>What<br /><select style={input} value={f.kind} onChange={(e) => pickKind(e.target.value)}>{Object.entries(DEADLINE_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        {isCourse && <label style={{ fontSize: 12 }}>Course<br /><select style={input} value={f.courseId} onChange={(e) => setF({ ...f, courseId: e.target.value })}><option value="">— choose —</option>{myCourses.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>}
        <label style={{ fontSize: 12 }}>Title<br /><input style={{ ...input, width: 230 }} value={f.title} placeholder="What must be done" onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
        <label style={{ fontSize: 12 }}>Due date<br /><input style={input} type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></label>
        <button className="btn" onClick={add}>Set deadline</button>
        <span style={{ fontSize: 12.5, color: ok ? "var(--sage)" : "#b3261e" }}>{msg}</span>
      </div>
      {isCourse && myCourses.length === 0 && <p style={{ fontSize: 12, color: "#96650F", marginBottom: 0 }}>This person has no course linked to them as Subject Expert or Instructor yet.</p>}
      <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 0 }}>For course work (CLOs, lecture plan, papers, marks and so on) the deadline is marked done automatically when the work is saved. Other tasks are ticked off by the person.</p>
    </div>
  );
}
