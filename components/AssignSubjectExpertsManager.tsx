"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import SortableTable from "./SortableTable";

type Course = {
  id: string; code: string; title: string; courseType: string; semesterNumber: number | null;
  subjectExpertId: string | null; batchLabel: string; linkedFollowerCodes: string[];
};
type SubjectExpert = { id: string; name: string };
type Batch = { id: string; degreeProgram: string; batchName: string };

export default function AssignSubjectExpertsManager({ courses: initialCourses, subjectExperts, batches, selectedBatchId }: {
  courses: Course[]; subjectExperts: SubjectExpert[]; batches: Batch[]; selectedBatchId: string;
}) {
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>(initialCourses);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function switchBatch(batchId: string) {
    router.push(batchId ? `/coordinator/assign-subject-experts?batchId=${batchId}` : "/coordinator/assign-subject-experts");
  }

  async function assignSe(courseId: string, subjectExpertId: string, revertEl: HTMLSelectElement, revertValue: string) {
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/coordinator/courses/${courseId}/assign-se`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subjectExpertId: subjectExpertId || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Couldn't assign — the course still shows its previous Subject Expert.");
        revertEl.value = revertValue;
        setLoading(false); return;
      }
      setCourses((prev) => prev.map((c) => c.id === courseId ? { ...c, subjectExpertId: subjectExpertId || null } : c));
      setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); revertEl.value = revertValue; setLoading(false); }
  }

  return (
    <>
      {error && <div className="err">{error}</div>}

      {batches.length > 0 && (
        <div className="card" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <label style={{ fontSize: 11.5, color: "var(--slate)", textTransform: "uppercase", letterSpacing: ".05em" }}>Viewing batch</label>
          <select value={selectedBatchId} onChange={(e) => switchBatch(e.target.value)} style={{ padding: "6px 8px", border: "1px solid var(--line)", fontSize: 12.5 }}>
            <option value="">All batches</option>
            {batches.map((b) => <option key={b.id} value={b.id}>{b.degreeProgram} — {b.batchName}</option>)}
          </select>
        </div>
      )}

      <div className="card" style={{ overflowX: "auto" }}>
        <SortableTable>
          <thead><tr><th>Batch</th><th>Code</th><th>Title</th><th>Type</th><th>Semester</th><th>Also Covers</th><th>Subject Expert</th></tr></thead>
          <tbody>
            {courses.length === 0 && <tr><td colSpan={7} style={{ color: "var(--slate)" }}>No assignable courses in this view.</td></tr>}
            {courses.map((c) => (
              <tr key={c.id}>
                <td style={{ fontSize: 11.5, color: "var(--slate)" }}>{c.batchLabel}</td>
                <td>{c.code}</td><td>{c.title}</td><td>{c.courseType}</td>
                <td>{c.semesterNumber ?? "—"}</td>
                <td style={{ fontSize: 11 }}>
                  {c.linkedFollowerCodes.length > 0 ? c.linkedFollowerCodes.join(", ") : <span style={{ color: "var(--slate)" }}>—</span>}
                </td>
                <td>
                  <select
                    defaultValue={c.subjectExpertId || ""} disabled={loading}
                    onChange={(e) => assignSe(c.id, e.target.value, e.target, c.subjectExpertId || "")}
                    style={{ padding: "5px 7px", border: "1px solid var(--line)", fontSize: 12.5 }}
                  >
                    <option value="">— Unassigned —</option>
                    {subjectExperts.map((se) => <option key={se.id} value={se.id}>{se.name}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </SortableTable>
        {subjectExperts.length === 0 && (
          <div style={{ fontSize: 11.5, color: "var(--slate)", marginTop: 10 }}>No Subject Experts onboarded yet — add one under Faculty Onboarding first.</div>
        )}
      </div>
    </>
  );
}
