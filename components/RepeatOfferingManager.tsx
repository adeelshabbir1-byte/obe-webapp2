"use client";

import { Fragment, useState } from "react";
import SortableTable from "./SortableTable";

type Course = { id: string; code: string; title: string; batchLabel: string; isOffered: boolean; offeredTermName: string | null; offeredTermYear: number | null; enrolledStudents: { id: string; name: string; rollNumber: string; batchLabel: string }[] };
type Student = { id: string; name: string; rollNumber: string; batchLabel: string };
type Suggestion = {
  code: string; title: string; creditHours: number; studentCount: number; overdueCount: number;
  students: { id: string; name: string; rollNumber: string; batchLabel: string; overdue: boolean }[];
  suggestedCourseId: string; suggestedBatchLabel: string;
};

export default function RepeatOfferingManager({ initialCourses, allStudents, suggestions = [] }: { initialCourses: Course[]; allStudents: Student[]; suggestions?: Suggestion[] }) {
  const [courses, setCourses] = useState<Course[]>(initialCourses);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [dismissedCodes, setDismissedCodes] = useState<string[]>([]);

  async function toggleOffer(courseId: string, offer: boolean) {
    setLoading(true); setError("");
    const res = await fetch(`/api/coordinator/courses/${courseId}/repeat-offer`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ offer, year: new Date().getFullYear() }),
    });
    const data = await res.json();
    if (res.ok) setCourses((prev) => prev.map((c) => c.id === courseId ? { ...c, isOffered: data.course.isOffered, offeredTermName: data.course.offeredTermName, offeredTermYear: data.course.offeredTermYear } : c));
    setLoading(false);
  }

  async function enrollStudent(courseId: string, studentId: string) {
    if (!studentId) return;
    setLoading(true); setError("");
    const res = await fetch(`/api/coordinator/courses/${courseId}/enroll`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentId }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
    const student = allStudents.find((s) => s.id === studentId);
    if (student) setCourses((prev) => prev.map((c) => c.id === courseId ? { ...c, enrolledStudents: [...c.enrolledStudents, student] } : c));
    setLoading(false);
  }

  async function removeEnrollment(courseId: string, studentId: string) {
    setLoading(true);
    await fetch(`/api/coordinator/courses/${courseId}/enroll`, {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentId }),
    });
    setCourses((prev) => prev.map((c) => c.id === courseId ? { ...c, enrolledStudents: c.enrolledStudents.filter((s) => s.id !== studentId) } : c));
    setLoading(false);
  }

  async function offerAndEnrollAll(s: Suggestion) {
    setLoading(true); setError("");
    try {
      const offerRes = await fetch(`/api/coordinator/courses/${s.suggestedCourseId}/repeat-offer`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ offer: true, year: new Date().getFullYear() }),
      });
      const offerData = await offerRes.json();
      if (!offerRes.ok) { setError(offerData.error || "Something went wrong."); setLoading(false); return; }
      let updatedCourse = offerData.course;
      const enrolled: Student[] = [];
      for (const stu of s.students) {
        const res = await fetch(`/api/coordinator/courses/${s.suggestedCourseId}/enroll`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentId: stu.id }),
        });
        if (res.ok) {
          const match = allStudents.find((a) => a.id === stu.id);
          if (match) enrolled.push(match);
        }
      }
      setCourses((prev) => prev.map((c) => c.id === s.suggestedCourseId
        ? { ...c, isOffered: updatedCourse.isOffered, offeredTermName: updatedCourse.offeredTermName, offeredTermYear: updatedCourse.offeredTermYear, enrolledStudents: [...c.enrolledStudents, ...enrolled] }
        : c));
      setDismissedCodes((prev) => [...prev, s.code]);
      setExpandedId(s.suggestedCourseId);
    } catch (err: any) { setError("Unexpected error: " + err.message); }
    setLoading(false);
  }

  const visibleSuggestions = suggestions.filter((s) => !dismissedCodes.includes(s.code));
  const filtered = courses.filter((c) => !search || c.code.toLowerCase().includes(search.toLowerCase()) || c.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      {error && <div className="err">{error}</div>}

      {visibleSuggestions.length > 0 && (
        <div className="card" style={{ borderColor: "var(--brass-dark)", background: "#FBF6EA" }}>
          <h3 style={{ fontSize: 14, marginBottom: 4 }}>Suggested Extra Offerings</h3>
          <p style={{ fontSize: 12, color: "var(--slate)", marginBottom: 10 }}>
            These courses have no section offered anywhere right now, but students already need them to stay on
            track for graduation. Ranked by how many students are stuck without them ("Overdue" means the course
            is already behind their planned semester, not just due this term).
          </p>
          {visibleSuggestions.map((s) => (
            <div key={s.code} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--line)", flexWrap: "wrap" }}>
              <div style={{ fontSize: 12.5 }}>
                <b>{s.code}</b> — {s.title} <span style={{ color: "var(--slate)", fontSize: 11 }}>({s.creditHours} cr, would open on {s.suggestedBatchLabel}'s copy)</span>
                <div style={{ marginTop: 3 }}>
                  <span className="badge badge-warn" style={{ fontSize: 10 }}>{s.studentCount} student{s.studentCount === 1 ? "" : "s"} need it</span>
                  {s.overdueCount > 0 && <span className="badge" style={{ fontSize: 10, marginLeft: 6, background: "#FBEAEA", color: "var(--rust)" }}>{s.overdueCount} overdue</span>}
                </div>
                <p style={{ fontSize: 11, color: "var(--slate)", marginTop: 4 }}>
                  {s.students.slice(0, 6).map((stu) => `${stu.name} (${stu.rollNumber})`).join(", ")}
                  {s.students.length > 6 ? `, +${s.students.length - 6} more` : ""}
                </p>
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <button onClick={() => offerAndEnrollAll(s)} disabled={loading} className="btn btn-brass" style={{ padding: "4px 10px", fontSize: 11.5 }}>Offer &amp; Enroll All</button>
                <button onClick={() => setDismissedCodes((prev) => [...prev, s.code])} disabled={loading} className="act act-neutral">Dismiss</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search courses..." style={{ padding: "7px 10px", border: "1px solid var(--line)", width: 280, fontSize: 12.5 }} />
      </div>

      <div className="card">
        <SortableTable>
          <thead><tr><th>Course</th><th>Home Batch</th><th>Repeat Offered</th><th>Enrolled (Repeat)</th><th></th></tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={5} style={{ color: "var(--slate)" }}>No courses found.</td></tr>}
            {filtered.map((c) => (
              <Fragment key={c.id}>
                <tr>
                  <td><b>{c.code}</b> {c.title}</td><td style={{ fontSize: 11.5 }}>{c.batchLabel}</td>
                  <td>{c.isOffered && c.offeredTermName === "Summer" ? <span className="badge badge-ok">{c.offeredTermName} {c.offeredTermYear}</span> : <span className="badge badge-neutral">No</span>}</td>
                  <td>{c.enrolledStudents.length}</td>
                  <td style={{ display: "flex", gap: 10 }}>
                    {c.isOffered && c.offeredTermName === "Summer" ? (
                      <>
                        <button onClick={() => toggleOffer(c.id, false)} disabled={loading} className="act act-danger">Stop Offering</button>
                        <button onClick={() => setExpandedId(expandedId === c.id ? null : c.id)} className="act act-primary">{expandedId === c.id ? "Close" : "Manage Students"}</button>
                      </>
                    ) : (
                      <button onClick={() => toggleOffer(c.id, true)} disabled={loading} className="btn btn-brass" style={{ padding: "4px 10px", fontSize: 11.5 }}>Offer for Repeat</button>
                    )}
                  </td>
                </tr>
                {expandedId === c.id && (
                  <tr>
                    <td colSpan={5}>
                      <div style={{ padding: "10px 0" }}>
                        <div style={{ marginBottom: 10 }}>
                          {c.enrolledStudents.length === 0 && <p style={{ fontSize: 12.5, color: "var(--slate)" }}>No students enrolled yet.</p>}
                          {c.enrolledStudents.map((s) => (
                            <div key={s.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "4px 0", borderBottom: "1px solid var(--line)" }}>
                              <span>{s.name} ({s.rollNumber}) — {s.batchLabel}</span>
                              <button onClick={() => removeEnrollment(c.id, s.id)} disabled={loading} className="act act-danger">Remove</button>
                            </div>
                          ))}
                        </div>
                        <select onChange={(e) => { enrollStudent(c.id, e.target.value); e.target.value = ""; }} disabled={loading} style={{ padding: "6px 8px", border: "1px solid var(--line)", fontSize: 12.5 }}>
                          <option value="">— Enroll a student —</option>
                          {allStudents.filter((s) => !c.enrolledStudents.some((e) => e.id === s.id)).map((s) => (
                            <option key={s.id} value={s.id}>{s.name} ({s.rollNumber}) — {s.batchLabel}</option>
                          ))}
                        </select>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </SortableTable>
      </div>
    </>
  );
}
