import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { courseTypeColor } from "../../../lib/courseTypeColors";
import Shell from "../../../components/Shell";

const NAV = [
  { href: "/coordinator/faculty", label: "Faculty Onboarding" },
  { href: "/coordinator/batches", label: "Degree Programs & Batches" },
  { href: "/coordinator/courses", label: "Courses" },
  { href: "/coordinator/assign-subject-experts", label: "Assign Subject Experts" },
  { href: "/coordinator/elective-options", label: "Elective Options" },
  { href: "/coordinator/custom-categories", label: "Course & Faculty Categories" },
  { href: "/coordinator/out-of-batch-requests", label: "Out-of-Batch Requests" },
  { href: "/coordinator/plos", label: "Program Learning Outcomes" },
  { href: "/coordinator/semester", label: "Current Semester" },
  { href: "/coordinator/timetable", label: "Timetable" },
  { href: "/coordinator/calendar", label: "Calendar & Exam Dates" },
  { href: "/coordinator/students", label: "Students" },
  { href: "/coordinator/repeat-offering", label: "Repeat/Summer Offering" },
  { href: "/coordinator/grading-scale", label: "Grading Scale" },
  { href: "/coordinator/assignment-history", label: "Assignment History" },
  { href: "/coordinator/report-bundles", label: "Report Bundles" },
  { href: "/coordinator/program-profile", label: "Program Document" },
  { href: "/coordinator/required-books", label: "Required Textbooks" },
  { href: "/coordinator/student-transcript", label: "Student Transcript" },
  { href: "/coordinator/stakeholders", label: "Alumni & Employers" },
  { href: "/coordinator/surveys", label: "Feedback Surveys" },
  { href: "/coordinator/load-report", label: "Teacher Load Report" },
  { href: "/coordinator/elective-instructor-report", label: "Elective Instructor Report" },
  { href: "/coordinator/program-semester-map", label: "Program Semester Map" },
  { href: "/coordinator/semester-health", label: "Semester Health" },
  { href: "/coordinator/batch-comparison", label: "Batch Comparison" },
  { href: "/coordinator/prerequisite-map", label: "Prerequisite Map" },
  { href: "/coordinator/feedforward-digest", label: "Feed-Forward Digest" },
  { href: "/omc/reports", label: "OMC Reports" },
];

export default async function ProgramSemesterMapPage({ searchParams }: { searchParams: { degree?: string; term?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "PROGRAM_COORDINATOR") redirect("/dashboard");

  const allBatches = await prisma.batch.findMany({ where: { coordinatorId: user.id }, orderBy: [{ degreeProgram: "asc" }, { batchName: "desc" }] });
  const degrees = Array.from(new Set(allBatches.map((b) => b.degreeProgram)));
  const selectedDegree = searchParams.degree || degrees[0] || "";
  const batchesForDegree = allBatches.filter((b) => b.degreeProgram === selectedDegree);
  const batchIds = batchesForDegree.map((b) => b.id);

  // Every batch offers its own courses in its own term, so without a
  // term filter here a batch's Fall offering and a different batch's
  // Spring offering both land in the same "semester N" row at once,
  // wrongly implying they're both running right now. Available terms
  // are scoped to this specific program, not the Coordinator's whole
  // portfolio, since a term one program is running may not be one
  // another program is.
  const termRows = batchIds.length > 0
    ? await prisma.course.findMany({ where: { batchId: { in: batchIds }, offeredTermName: { not: null }, offeredTermYear: { not: null } }, distinct: ["offeredTermName", "offeredTermYear"], select: { offeredTermName: true, offeredTermYear: true } })
    : [];
  const availableTerms = termRows.map((r) => ({ termName: r.offeredTermName!, year: r.offeredTermYear! }))
    .sort((a, b) => (b.year - a.year) || a.termName.localeCompare(b.termName));
  function termKey(t: { termName: string; year: number }) { return `${t.termName}-${t.year}`; }
  const selectedTermKey = searchParams.term || (availableTerms[0] ? termKey(availableTerms[0]) : "");
  const selectedTerm = availableTerms.find((t) => termKey(t) === selectedTermKey) || null;

  // Every currently-offered course, for the one selected term, across
  // every one of this program's batches, overlaid by semester — so
  // semester 5 shows every active batch's own semester 5 side by side,
  // all genuinely running in that same term, not just one batch at a
  // time and not mixing terms together.
  const courses = batchIds.length > 0 && selectedTerm
    ? await prisma.course.findMany({
        where: { batchId: { in: batchIds }, isOffered: true, offeredTermName: selectedTerm.termName, offeredTermYear: selectedTerm.year },
        include: { batch: true, instructor: true },
        orderBy: [{ semesterNumber: "asc" }, { batchId: "asc" }, { code: "asc" }],
      })
    : [];

  const maxSemester = courses.length > 0 ? Math.max(8, ...courses.map((c) => c.semesterNumber || 1)) : 8;
  const bySemester: Record<number, typeof courses> = {};
  for (const c of courses) {
    const sem = c.semesterNumber || 1;
    bySemester[sem] = [...(bySemester[sem] || []), c];
  }

  return (
    <Shell roleLabel="Program Coordinator" userName={user.name} navLinks={NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Program Semester Map</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Every course actually offered in one specific term across all of a program's batches, one row per
        semester, with who's teaching it and which batch it belongs to. Read-only — this is a report, not an
        editor.
      </p>

      <div className="card">
        <form method="GET" style={{ display: "flex", gap: 14, alignItems: "flex-end" }}>
          <div>
            <label style={{ fontSize: 11, color: "var(--slate)", display: "block", marginBottom: 4 }}>Degree Program</label>
            <select name="degree" defaultValue={selectedDegree} style={{ padding: "6px 8px", border: "1px solid var(--line)", fontSize: 12.5 }}>
              {degrees.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, color: "var(--slate)", display: "block", marginBottom: 4 }}>Term</label>
            <select name="term" defaultValue={selectedTermKey} style={{ padding: "6px 8px", border: "1px solid var(--line)", fontSize: 12.5 }}>
              {availableTerms.length === 0 && <option value="">No terms offered yet</option>}
              {availableTerms.map((t) => <option key={termKey(t)} value={termKey(t)}>{t.termName} {t.year}</option>)}
            </select>
          </div>
          <button type="submit" className="btn btn-brass">Show Map</button>
        </form>
      </div>

      {courses.length === 0 && (
        <div className="card"><p style={{ fontSize: 12.5, color: "var(--slate)" }}>No offered courses found for this program in this term.</p></div>
      )}

      {Array.from({ length: maxSemester }, (_, i) => i + 1).map((sem) => {
        const semCourses = bySemester[sem] || [];
        if (semCourses.length === 0) return null;
        return (
          <div key={sem} className="card">
            <h3 style={{ fontSize: 14, marginBottom: 10 }}>Semester {sem}</h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {semCourses.map((c) => (
                <div key={c.id} style={{ minWidth: 200, maxWidth: 240, border: "1px solid var(--line)", borderLeft: `4px solid ${courseTypeColor(c.courseType)}`, padding: "8px 10px", borderRadius: 3 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600 }}>{c.code} — {c.title}</div>
                  <div style={{ fontSize: 11, color: "var(--slate)", marginTop: 4 }}>{c.batch ? `${c.batch.degreeProgram} — ${c.batch.batchName}` : "—"}</div>
                  <div style={{ fontSize: 11, marginTop: 2 }}>
                    {c.instructor ? c.instructor.name : <span style={{ color: "var(--rust)" }}>No instructor assigned</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </Shell>
  );
}
