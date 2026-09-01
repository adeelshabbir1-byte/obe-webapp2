"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Instructor = { id: string; name: string };
type OfferedCourse = { id: string; code: string; title: string; batchLabel: string; semesterNumber: number | null; instructorId: string | null };
type NotOfferedCourse = { id: string; code: string; title: string; batchLabel: string; semesterNumber: number | null };

export default function SemesterManager({ currentTerm, offeredCourses, notOfferedCourses, instructors }: {
  currentTerm: { termName: string; year: number } | null;
  offeredCourses: OfferedCourse[];
  notOfferedCourses: NotOfferedCourse[];
  instructors: Instructor[];
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");

  async function saveTerm(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true); setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/coordinator/current-term", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ termName: fd.get("termName"), year: fd.get("year") }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setLoading(false); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function offerSemester() {
    setLoading(true); setError(""); setResult("");
    try {
      const res = await fetch("/api/coordinator/offer-semester", { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      const lines = data.perBatch.map((b: any) => `${b.batchName}: Semester ${b.semesterNumber}, ${b.coursesOffered} course(s) newly offered`);
      setResult(`${data.offered} course(s) offered in total.\n${lines.join("\n")}`);
      setLoading(false); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function assignInstructor(courseId: string, instructorId: string) {
    setLoading(true);
    await fetch(`/api/coordinator/courses/${courseId}/assign-instructor`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ instructorId: instructorId || null }),
    });
    setLoading(false); router.refresh();
  }

  async function toggleOffered(courseId: string, isOffered: boolean) {
    setLoading(true);
    await fetch(`/api/coordinator/courses/${courseId}/offer-toggle`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isOffered }),
    });
    setLoading(false); router.refresh();
  }

  return (
    <>
      {error && <div className="err">{error}</div>}
      {result && <div style={{ background: "#E4EEE8", color: "var(--sage)", border: "1px solid #BEDACB", padding: "8px 12px", fontSize: 12.5, marginBottom: 12, whiteSpace: "pre-line" }}>{result}</div>}

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 10 }}>Current Term</h3>
        <form onSubmit={saveTerm} style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
          <div>
            <label style={{ fontSize: 11, color: "var(--slate)", display: "block", marginBottom: 4 }}>Term</label>
            <select name="termName" defaultValue={currentTerm?.termName || "Fall"} style={{ padding: "7px 9px", border: "1px solid var(--line)" }}>
              <option value="Fall">Fall</option>
              <option value="Spring">Spring</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, color: "var(--slate)", display: "block", marginBottom: 4 }}>Year</label>
            <input name="year" type="number" defaultValue={currentTerm?.year || new Date().getFullYear()} style={{ padding: "7px 9px", border: "1px solid var(--line)", width: 90 }} required />
          </div>
          <button type="submit" disabled={loading} className="btn btn-brass" style={{ padding: "7px 14px" }}>Set Current Term</button>
        </form>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 8 }}>Offer This Semester's Courses</h3>
        <p style={{ fontSize: 12.5, color: "var(--slate)", marginBottom: 12 }}>
          Automatically activates every course, across every batch, whose Semester number matches where that batch
          currently is (Fall-start batches take odd semesters in Fall, even in Spring — and vice versa for Spring-start batches).
        </p>
        <button onClick={offerSemester} disabled={loading || !currentTerm} className="btn btn-brass">{loading ? "Working…" : "Offer This Semester's Courses"}</button>
        {!currentTerm && <div style={{ fontSize: 11.5, color: "var(--slate)", marginTop: 8 }}>Set the current term above first.</div>}
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <h3 style={{ fontSize: 14, marginBottom: 10 }}>Currently Offered Courses</h3>
        <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 10 }}>You can finalize this list — remove anything that shouldn't be offered this semester.</p>
        <table>
          <thead><tr><th>Batch</th><th>Code</th><th>Title</th><th>Semester</th><th>Instructor</th><th></th></tr></thead>
          <tbody>
            {offeredCourses.length === 0 && <tr><td colSpan={6} style={{ color: "var(--slate)" }}>No courses offered yet.</td></tr>}
            {offeredCourses.map((c) => (
              <tr key={c.id}>
                <td style={{ fontSize: 11.5 }}>{c.batchLabel}</td><td>{c.code}</td><td>{c.title}</td><td>{c.semesterNumber ?? "—"}</td>
                <td>
                  <select defaultValue={c.instructorId || ""} onChange={(e) => assignInstructor(c.id, e.target.value)} disabled={loading} style={{ padding: "5px 7px", border: "1px solid var(--line)", fontSize: 12.5 }}>
                    <option value="">— Unassigned —</option>
                    {instructors.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                  </select>
                </td>
                <td><button onClick={() => toggleOffered(c.id, false)} disabled={loading} style={{ background: "none", border: "none", color: "var(--rust)", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0 }}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {instructors.length === 0 && (
          <div style={{ fontSize: 11.5, color: "var(--slate)", marginTop: 10 }}>No Course Instructors onboarded yet — add one under Faculty Onboarding first.</div>
        )}
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <h3 style={{ fontSize: 14, marginBottom: 10 }}>Not Currently Offered</h3>
        <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 10 }}>Add any course manually that the automatic offering missed.</p>
        <table>
          <thead><tr><th>Batch</th><th>Code</th><th>Title</th><th>Semester</th><th></th></tr></thead>
          <tbody>
            {notOfferedCourses.length === 0 && <tr><td colSpan={5} style={{ color: "var(--slate)" }}>Nothing else to offer.</td></tr>}
            {notOfferedCourses.map((c) => (
              <tr key={c.id}>
                <td style={{ fontSize: 11.5 }}>{c.batchLabel}</td><td>{c.code}</td><td>{c.title}</td><td>{c.semesterNumber ?? "—"}</td>
                <td><button onClick={() => toggleOffered(c.id, true)} disabled={loading} style={{ background: "none", border: "none", color: "var(--brass-dark)", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0 }}>Offer</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
