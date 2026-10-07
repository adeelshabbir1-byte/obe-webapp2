"use client";

import { useEffect, useState } from "react";

type Course = { id: string; code: string; title: string; current: string | null; batch: string; departmentId: string | null };
type Dept = { id: string; name: string };
type Teacher = { id: string; name: string; departmentId: string | null };
type Req = { id: string; status: string; course: string; teacher: string; from: string; for: string; note: string | null; decisionNote: string | null; createdAt: string };

const STATUS_STYLE: Record<string, string> = { PENDING: "#96650F", APPROVED: "var(--sage)", REJECTED: "#b3261e", CANCELLED: "var(--slate)" };

export default function BorrowTeacher() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [departments, setDepartments] = useState<Dept[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [requests, setRequests] = useState<Req[]>([]);
  const [courseId, setCourseId] = useState("");
  const [fromDept, setFromDept] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const res = await fetch("/api/loans");
    const d = await res.json();
    if (!res.ok) { setError(d.error || "Could not load"); return; }
    setCourses(d.courses); setDepartments(d.departments); setTeachers(d.teachers); setRequests(d.requests);
  }
  useEffect(() => { load(); }, []);

  const course = courses.find((c) => c.id === courseId);
  const otherDepts = departments.filter((d) => d.id !== course?.departmentId);
  const candidates = teachers.filter((t) => t.departmentId === fromDept && t.departmentId !== course?.departmentId);

  async function submit() {
    setError(""); setMsg("");
    const res = await fetch("/api/loans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseId, instructorId: teacherId, note }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { setError(d.error || "Could not send the request"); return; }
    setMsg(d.autoApproved ? "Approved automatically (that department has no head). The teacher is now on the course." : "Request sent to the lending department's head.");
    setTeacherId(""); setNote("");
    load();
  }

  async function cancel(id: string) {
    await fetch(`/api/loans?id=${id}`, { method: "DELETE" });
    load();
  }

  return (
    <>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Ask another department for a teacher</h3>
        <p style={{ color: "var(--slate)", fontSize: 13 }}>Pick the course, the department that would lend the teacher, then the teacher. Their head approves before the teacher is put on the course.</p>
        <div style={{ display: "grid", gap: 8, maxWidth: 560 }}>
          <select value={courseId} onChange={(e) => { setCourseId(e.target.value); setFromDept(""); setTeacherId(""); }}>
            <option value="">— choose course —</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.title} ({c.batch}){c.current ? ` · now: ${c.current}` : ""}</option>)}
          </select>
          <select value={fromDept} onChange={(e) => { setFromDept(e.target.value); setTeacherId(""); }} disabled={!courseId}>
            <option value="">— lending department —</option>
            {otherDepts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} disabled={!fromDept}>
            <option value="">— teacher —</option>
            {candidates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for the lending head (optional)" />
          {error && <div style={{ color: "#b3261e" }}>{error}</div>}
          {msg && <div style={{ color: "var(--sage)" }}>{msg}</div>}
          <button className="btn btn-brass" disabled={!courseId || !teacherId} onClick={submit}>Send request</button>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Requests</h3>
        <table>
          <thead><tr><th>Course</th><th>Teacher</th><th>From</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {requests.length === 0 && <tr><td colSpan={5} style={{ color: "var(--slate)" }}>No requests yet.</td></tr>}
            {requests.map((r) => (
              <tr key={r.id}>
                <td>{r.course}</td><td>{r.teacher}</td><td>{r.from}</td>
                <td style={{ color: STATUS_STYLE[r.status] }}><b>{r.status}</b>{r.decisionNote ? ` — ${r.decisionNote}` : ""}</td>
                <td>{r.status === "PENDING" && <button className="btn" onClick={() => cancel(r.id)}>Withdraw</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
