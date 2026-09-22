"use client";

import { useState } from "react";
import SortableTable from "./SortableTable";
import { useRouter } from "next/navigation";

type Instructor = { id: string; name: string };
type OfferedCourse = { id: string; code: string; title: string; batchLabel: string; semesterNumber: number | null; instructorName: string | null };
type NotOfferedCourse = { id: string; code: string; title: string; batchLabel: string; semesterNumber: number | null };

export default function SemesterManager({ currentTerm, offeredCourses: initialOffered, notOfferedCourses: initialNotOffered, instructors }: {
  currentTerm: { termName: string; year: number } | null;
  offeredCourses: OfferedCourse[];
  notOfferedCourses: NotOfferedCourse[];
  instructors: Instructor[];
}) {
  const router = useRouter();
  const [offeredCourses, setOfferedCourses] = useState<OfferedCourse[]>(initialOffered);
  const [notOfferedCourses, setNotOfferedCourses] = useState<NotOfferedCourse[]>(initialNotOffered);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");

  async function saveTerm(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const newTermName = fd.get("termName") as string;
    const newYear = fd.get("year") as string;

    // Changing to a genuinely different term is a real transition (results
    // get snapshotted, new courses get offered) — confirm deliberately
    // rather than silently overwriting whatever term was set before.
    if (currentTerm && (currentTerm.termName !== newTermName || String(currentTerm.year) !== newYear)) {
      const proceed = confirm(
        `You're currently on ${currentTerm.termName} ${currentTerm.year}. Setting this to ${newTermName} ${newYear} will make it your new active semester — courses will be offered based on THIS term going forward.\n\nMake sure ${currentTerm.termName} ${currentTerm.year} is fully wrapped up (marks entered, results finalized) before moving on, since re-offering a course resets its marks for the next cohort.\n\nContinue and start ${newTermName} ${newYear}?`
      );
      if (!proceed) return;
    }

    setLoading(true); setError("");
    try {
      const res = await fetch("/api/coordinator/current-term", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ termName: newTermName, year: newYear }),
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
      const lines = data.perBatch.map((b: any) =>
        b.notStarted
          ? `${b.batchName}: hasn't started yet (its own intake term is still ahead) — nothing offered`
          : b.prerequisitesNotConfirmed
          ? `${b.batchName}: Prerequisite Map hasn't been confirmed yet — set it up first, then come back here`
          : `${b.batchName}: Semester ${b.semesterNumber}, ${b.coursesOffered} course(s) newly offered`
      );
      setResult(`${data.offered} course(s) offered in total.\n${lines.join("\n")}`);
      setLoading(false); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function toggleOffered(courseId: string, isOffered: boolean) {
    setLoading(true);
    const res = await fetch(`/api/coordinator/courses/${courseId}/offer-toggle`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isOffered }),
    });
    if (res.ok) {
      if (isOffered) {
        const moved = notOfferedCourses.find((c) => c.id === courseId);
        if (moved) {
          setNotOfferedCourses((prev) => prev.filter((c) => c.id !== courseId));
          setOfferedCourses((prev) => [...prev, { ...moved, instructorName: null }]);
        }
      } else {
        const moved = offeredCourses.find((c) => c.id === courseId);
        if (moved) {
          setOfferedCourses((prev) => prev.filter((c) => c.id !== courseId));
          setNotOfferedCourses((prev) => [...prev, moved]);
        }
      }
    }
    setLoading(false);
  }

  return (
    <>
      {error && <div className="err">{error}</div>}
      {result && <div style={{ background: "#CCFBF1", color: "var(--sage)", border: "1px solid #99F1E4", padding: "8px 12px", fontSize: 12.5, marginBottom: 12, whiteSpace: "pre-line" }}>{result}</div>}

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
        <SortableTable>
          <thead><tr><th>Batch</th><th>Code</th><th>Title</th><th>Semester</th><th>Instructor</th><th></th></tr></thead>
          <tbody>
            {offeredCourses.length === 0 && <tr><td colSpan={6} style={{ color: "var(--slate)" }}>No courses offered yet.</td></tr>}
            {offeredCourses.map((c) => (
              <tr key={c.id}>
                <td style={{ fontSize: 11.5 }}>{c.batchLabel}</td><td>{c.code}</td><td>{c.title}</td><td>{c.semesterNumber ?? "—"}</td>
                <td style={{ fontSize: 12.5 }}>{c.instructorName || <span style={{ color: "var(--slate)" }}>Not yet assigned — see Course Assigner</span>}</td>
                <td><button onClick={() => toggleOffered(c.id, false)} disabled={loading} style={{ background: "none", border: "none", color: "var(--rust)", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0 }}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </SortableTable>
        {instructors.length === 0 && (
          <div style={{ fontSize: 11.5, color: "var(--slate)", marginTop: 10 }}>No Course Instructors onboarded yet — add one under Faculty Onboarding first.</div>
        )}
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <h3 style={{ fontSize: 14, marginBottom: 10 }}>Not Currently Offered</h3>
        <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 10 }}>Add any course manually that the automatic offering missed.</p>
        <SortableTable>
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
        </SortableTable>
      </div>
    </>
  );
}
