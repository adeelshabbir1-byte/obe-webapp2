"use client";

import { Fragment, useState } from "react";
import SortableTable from "./SortableTable";
import { useRouter } from "next/navigation";

type Course = { id: string; code: string; title: string; batchLabel: string; isOffered: boolean; offeredTermName: string | null; offeredTermYear: number | null; enrolledStudents: { id: string; name: string; rollNumber: string; batchLabel: string }[] };
type Student = { id: string; name: string; rollNumber: string; batchLabel: string };

export default function RepeatOfferingManager({ initialCourses, allStudents }: { initialCourses: Course[]; allStudents: Student[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  async function toggleOffer(courseId: string, offer: boolean) {
    setLoading(true); setError("");
    await fetch(`/api/coordinator/courses/${courseId}/repeat-offer`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ offer, year: new Date().getFullYear() }),
    });
    setLoading(false); router.refresh();
  }

  async function enrollStudent(courseId: string, studentId: string) {
    if (!studentId) return;
    setLoading(true); setError("");
    const res = await fetch(`/api/coordinator/courses/${courseId}/enroll`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentId }),
    });
    const data = await res.json();
    if (!res.ok) setError(data.error || "Something went wrong.");
    setLoading(false); router.refresh();
  }

  async function removeEnrollment(courseId: string, studentId: string) {
    setLoading(true);
    await fetch(`/api/coordinator/courses/${courseId}/enroll`, {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentId }),
    });
    setLoading(false); router.refresh();
  }

  const filtered = initialCourses.filter((c) => !search || c.code.toLowerCase().includes(search.toLowerCase()) || c.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      {error && <div className="err">{error}</div>}
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
                        <button onClick={() => toggleOffer(c.id, false)} disabled={loading} style={{ background: "none", border: "none", color: "var(--rust)", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0 }}>Stop Offering</button>
                        <button onClick={() => setExpandedId(expandedId === c.id ? null : c.id)} style={{ background: "none", border: "none", color: "var(--brass-dark)", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0 }}>{expandedId === c.id ? "Close" : "Manage Students"}</button>
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
                              <button onClick={() => removeEnrollment(c.id, s.id)} disabled={loading} style={{ background: "none", border: "none", color: "var(--rust)", fontSize: 11.5, textDecoration: "underline", cursor: "pointer", padding: 0 }}>Remove</button>
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
