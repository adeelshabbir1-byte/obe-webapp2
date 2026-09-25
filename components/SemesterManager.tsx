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

    // Changing to a genuinely different term needs a real decision, not
    // a single generic confirmation: is this moving forward to an
    // actual new semester (leave everything from before as history), or
    // fixing a mistake in what was set before (clear the offering data
    // that was created under the wrong value, so it can be cleanly
    // redone under the corrected one)?
    let mode: "new" | "rewrite" = "new";
    if (currentTerm && (currentTerm.termName !== newTermName || String(currentTerm.year) !== newYear)) {
      const choice = prompt(
        `You're currently on ${currentTerm.termName} ${currentTerm.year}. Changing this to ${newTermName} ${newYear} — which do you mean?\n\n` +
        `Type "new" to START a new semester — ${currentTerm.termName} ${currentTerm.year}'s offered courses stay as history, untouched.\n` +
        `Type "rewrite" if ${currentTerm.termName} ${currentTerm.year} was a MISTAKE — every course currently offered under it gets un-offered, so you can cleanly redo "Offer This Semester's Courses" under the corrected value.\n\n` +
        `Type "new" or "rewrite":`,
        "new"
      );
      if (choice === null) return; // cancelled
      if (choice.trim().toLowerCase() !== "new" && choice.trim().toLowerCase() !== "rewrite") {
        setError(`"${choice}" wasn't "new" or "rewrite" — nothing changed. Try again.`);
        return;
      }
      mode = choice.trim().toLowerCase() as "new" | "rewrite";
      if (mode === "rewrite") {
        const confirmed = confirm(`This will un-offer every course currently offered under ${currentTerm.termName} ${currentTerm.year} across every batch. This can't be undone from here. Continue?`);
        if (!confirmed) return;
      }
    }

    setLoading(true); setError("");
    try {
      const res = await fetch("/api/coordinator/current-term", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ termName: newTermName, year: newYear, mode }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      if (mode === "rewrite" && data.coursesReset > 0) setResult(`${data.coursesReset} course(s) un-offered from the old term value.`);
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
      {result && <div style={{ background: "#E2F4E8", color: "var(--sage)", border: "1px solid #B8E0C4", padding: "8px 12px", fontSize: 12.5, marginBottom: 12, whiteSpace: "pre-line" }}>{result}</div>}

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 10 }}>Current Term</h3>
        <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 10 }}>
          Changing this to a different term will ask whether you're starting a genuinely new semester
          (keeps everything from the old term as history) or rewriting a mistake (un-offers every course
          that was offered under the old, incorrect value).
        </p>
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
