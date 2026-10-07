"use client";

import { useEffect, useState } from "react";

type Course = { id: string; code: string; title: string; currentTeacher: string | null; currentExpert: string | null; batch: string; departmentId: string | null };
type Dept = { id: string; name: string };
type Teacher = { id: string; name: string; role: string; departmentId: string | null };
type Req = {
  id: string; kind: string; status: string; deanWaiting?: boolean; course: string; asked: string | null; from: string; for: string; note: string | null; decisionNote: string | null;
  allowed: { id: string; name: string }[]; assignedTo: string | null; response: string; responseNote: string | null;
};

const STATUS_COLOR: Record<string, string> = { PENDING: "#96650F", APPROVED: "var(--sage)", REJECTED: "#b3261e", CANCELLED: "var(--slate)" };
const KIND_LABEL: Record<string, string> = { INSTRUCTOR: "Teacher", SUBJECT_EXPERT: "Subject Expert" };

export default function BorrowTeacher() {
  const [kinds, setKinds] = useState<string[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [departments, setDepartments] = useState<Dept[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [requests, setRequests] = useState<Req[]>([]);
  const [kind, setKind] = useState("INSTRUCTOR");
  const [courseId, setCourseId] = useState("");
  const [fromDept, setFromDept] = useState("");
  const [teacherId, setTeacherId] = useState(""); // "" = any suitable person
  const [note, setNote] = useState("");
  const [pick, setPick] = useState<Record<string, string>>({}); // requestId -> chosen allowed person
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const res = await fetch("/api/loans");
    const d = await res.json();
    if (!res.ok) { setError(d.error || "Could not load"); return; }
    setKinds(d.kinds); setCourses(d.courses); setDepartments(d.departments); setTeachers(d.teachers); setRequests(d.requests);
    if (d.kinds.length > 0 && !d.kinds.includes(kind)) setKind(d.kinds[0]);
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const course = courses.find((c) => c.id === courseId);
  const otherDepts = departments.filter((d) => d.id !== course?.departmentId);
  const candidates = teachers.filter((t) => t.departmentId === fromDept && (kind === "INSTRUCTOR" || t.role === "SUBJECT_EXPERT"));

  async function submit() {
    setError(""); setMsg("");
    const res = await fetch("/api/loans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, courseId, lendingDepartmentId: fromDept, instructorId: teacherId || null, note }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { setError(d.error || "Could not send the request"); return; }
    setMsg(d.autoApproved ? "That department has no head, so everyone suitable was allowed. Choose one below." : "Request sent to the department's head.");
    setTeacherId(""); setNote("");
    load();
  }

  async function assign(r: Req) {
    const instructorId = pick[r.id] || r.allowed[0]?.id;
    if (!instructorId) return;
    setError(""); setMsg("");
    const res = await fetch("/api/loans/assign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ loanId: r.id, instructorId }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { setError(d.error || "Could not assign"); return; }
    setMsg("Assigned. They will see it on their dashboard and can accept or decline.");
    load();
  }

  async function cancel(id: string) { await fetch(`/api/loans?id=${id}`, { method: "DELETE" }); load(); }

  return (
    <>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Ask another department</h3>
        <p style={{ color: "var(--slate)", fontSize: 13 }}>
          Choose the course and the department. You can ask for one named person, or for any suitable person and let that department's head decide who. Once the head allows some people, pick one of them below.
        </p>
        <div style={{ display: "grid", gap: 8, maxWidth: 580 }}>
          {kinds.length > 1 && (
            <select value={kind} onChange={(e) => { setKind(e.target.value); setTeacherId(""); }}>
              {kinds.map((k) => <option key={k} value={k}>Ask for: {k === "SUBJECT_EXPERT" ? "a Subject Expert" : "a teacher"}</option>)}
            </select>
          )}
          <select value={courseId} onChange={(e) => { setCourseId(e.target.value); setFromDept(""); setTeacherId(""); }}>
            <option value="">— choose course —</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.title} ({c.batch}){kind === "SUBJECT_EXPERT" ? (c.currentExpert ? ` · SE now: ${c.currentExpert}` : "") : (c.currentTeacher ? ` · now: ${c.currentTeacher}` : "")}</option>)}
          </select>
          <select value={fromDept} onChange={(e) => { setFromDept(e.target.value); setTeacherId(""); }} disabled={!courseId}>
            <option value="">— department to ask —</option>
            {otherDepts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} disabled={!fromDept}>
            <option value="">Any suitable person (their head chooses)</option>
            {candidates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for the head (optional)" />
          {error && <div style={{ color: "#b3261e" }}>{error}</div>}
          {msg && <div style={{ color: "var(--sage)" }}>{msg}</div>}
          <button className="btn btn-brass" disabled={!courseId || !fromDept || kinds.length === 0} onClick={submit}>Send request</button>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Requests</h3>
        <table>
          <thead><tr><th>Course</th><th>For</th><th>Asked from</th><th>Status</th><th>Next step</th></tr></thead>
          <tbody>
            {requests.length === 0 && <tr><td colSpan={5} style={{ color: "var(--slate)" }}>No requests yet.</td></tr>}
            {requests.map((r) => (
              <tr key={r.id}>
                <td>{r.course}</td>
                <td>{KIND_LABEL[r.kind] || r.kind}{r.asked ? ` — ${r.asked}` : " — any suitable"}</td>
                <td>{r.from}</td>
                <td style={{ color: STATUS_COLOR[r.status] }}><b>{r.deanWaiting ? "WAITING FOR DEAN" : r.status === "APPROVED" ? "ALLOWED" : r.status}</b>{r.decisionNote ? ` — ${r.decisionNote}` : ""}</td>
                <td>
                  {r.status === "PENDING" && <button className="btn" onClick={() => cancel(r.id)}>Withdraw</button>}
                  {r.status === "APPROVED" && !r.deanWaiting && (
                    r.assignedTo && r.response !== "DECLINED" ? (
                      <span>
                        Assigned to <b>{r.assignedTo}</b> —{" "}
                        {r.response === "ACCEPTED" ? <span style={{ color: "var(--sage)" }}>accepted</span> : r.response === "PENDING" ? <span style={{ color: "#96650F" }}>waiting for them to accept</span> : "assigned"}
                      </span>
                    ) : (
                      <span>
                        {r.response === "DECLINED" && <div style={{ color: "#b3261e", fontSize: 12 }}>Declined{r.responseNote ? `: ${r.responseNote}` : ""} — pick someone else</div>}
                        <select value={pick[r.id] || r.allowed[0]?.id || ""} onChange={(e) => setPick((p) => ({ ...p, [r.id]: e.target.value }))}>
                          {r.allowed.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>{" "}
                        <button className="btn btn-brass" onClick={() => assign(r)} disabled={r.allowed.length === 0}>Assign</button>
                      </span>
                    )
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
