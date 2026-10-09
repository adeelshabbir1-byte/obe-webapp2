"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { COURSE_KINDS, DEADLINE_KINDS, KIND_ROLE } from "../lib/deadlines";

type Person = { id: string; name: string };
type CourseOpt = { id: string; label: string };
const input = { padding: "6px 8px", border: "1px solid var(--line)" } as const;

export default function DeadlineForm({ people, courses, roles }: { people: Person[]; courses: CourseOpt[]; roles: { value: string; label: string }[] }) {
  const router = useRouter();
  const [f, setF] = useState({ mode: "role", assigneeId: people[0]?.id || "", role: roles[0]?.value || "", kind: "CUSTOM", title: "", description: "", courseId: "", dueDate: "" });
  const [msg, setMsg] = useState(""); const [ok, setOk] = useState(false);
  const isCourse = COURSE_KINDS.includes(f.kind);
  const impliedRole = KIND_ROLE[f.kind];
  async function add() {
    setMsg("");
    const res = await fetch("/api/deadlines", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, courseId: isCourse ? f.courseId : "" }) });
    const d = await res.json().catch(() => ({}));
    setOk(res.ok); setMsg(res.ok ? "Deadline set." : d.error || "Something went wrong");
    if (res.ok) { setF({ ...f, title: "", description: "", dueDate: "" }); router.refresh(); }
  }
  function pickKind(kind: string) { setF({ ...f, kind, courseId: "", role: KIND_ROLE[kind] || (["SUBJECT_EXPERT", "INSTRUCTOR"].includes(f.role) || kind === "CUSTOM" ? f.role : "SUBJECT_EXPERT"), title: kind === "CUSTOM" ? f.title : DEADLINE_KINDS[kind] }); }
  const roleChoices = isCourse ? roles.filter((r) => ["SUBJECT_EXPERT", "INSTRUCTOR"].includes(r.value)) : roles;
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <h3 style={{ marginTop: 0 }}>Set a deadline</h3>
      <div style={{ display: "flex", gap: 14, marginBottom: 8, fontSize: 13 }}>
        <label><input type="radio" checked={f.mode === "role"} onChange={() => setF({ ...f, mode: "role" })} /> For a role or task (whoever holds it)</label>
        <label><input type="radio" checked={f.mode === "person"} onChange={() => setF({ ...f, mode: "person" })} /> For one named person</label>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
        <label style={{ fontSize: 12 }}>What<br /><select style={input} value={f.kind} onChange={(e) => pickKind(e.target.value)}>{Object.entries(DEADLINE_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        {isCourse && <label style={{ fontSize: 12 }}>Course<br /><select style={input} value={f.courseId} onChange={(e) => setF({ ...f, courseId: e.target.value })}><option value="">— choose —</option>{f.mode === "role" && <option value="ALL">All courses (every course in my area, now and later)</option>}{courses.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>}
        {f.mode === "role" ? (
          <label style={{ fontSize: 12 }}>Role<br /><select style={input} value={impliedRole || f.role} disabled={!!impliedRole} onChange={(e) => setF({ ...f, role: e.target.value })}>{roleChoices.map((r) => <option key={r.value} value={r.value}>{isCourse ? `${r.label} of the course` : r.label}</option>)}</select></label>
        ) : (
          <label style={{ fontSize: 12 }}>Person<br /><select style={input} value={f.assigneeId} onChange={(e) => setF({ ...f, assigneeId: e.target.value })}>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        )}
        <label style={{ fontSize: 12 }}>Title<br /><input style={{ ...input, width: 230 }} value={f.title} placeholder="What must be done" onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
        <label style={{ fontSize: 12 }}>Due date<br /><input style={input} type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></label>
        <button className="btn" onClick={add}>Set deadline</button>
        <span style={{ fontSize: 12.5, color: ok ? "var(--sage)" : "#b3261e" }}>{msg}</span>
      </div>
      <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 0 }}>
        You do not need to know who will do it. Choose All courses and the deadline applies to every course in your area, including courses added later; each person sees it once the course is assigned to them. A deadline for a role or task stays with the work: if the course gets a different Subject Expert or Instructor, the deadline moves to them. Course work (CLOs, lecture plan, papers, marks and so on) is marked done automatically when it is saved. Other tasks are ticked off by whoever holds the role.
      </p>
    </div>
  );
}
