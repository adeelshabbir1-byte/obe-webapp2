import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import SortableTable from "../../../components/SortableTable";

const NAV = [
  { href: "/coordinator/faculty", label: "Faculty Onboarding" },
  { href: "/coordinator/batches", label: "Degree Programs & Batches" },
  { href: "/coordinator/courses", label: "Courses" },
  { href: "/coordinator/assign-subject-experts", label: "Assign Subject Experts" },
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
  { href: "/coordinator/semester-health", label: "Semester Health" },
  { href: "/coordinator/batch-comparison", label: "Batch Comparison" },
  { href: "/coordinator/prerequisite-map", label: "Prerequisite Map" },
  { href: "/coordinator/feedforward-digest", label: "Feed-Forward Digest" },
  { href: "/omc/reports", label: "OMC Reports" },
];

export default async function AssignmentHistoryPage({ searchParams }: { searchParams: { term?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "PROGRAM_COORDINATOR") redirect("/dashboard");

  const [snapshotTerms, currentOfferedCourses] = await Promise.all([
    prisma.assignmentSnapshot.findMany({ where: { coordinatorId: user.id }, distinct: ["termName", "termYear"], select: { termName: true, termYear: true } }),
    prisma.course.findMany({ where: { coordinatorId: user.id, isOffered: true, offeredTermName: { not: null } }, distinct: ["offeredTermName", "offeredTermYear"], select: { offeredTermName: true, offeredTermYear: true } }),
  ]);

  const allTerms = [
    ...currentOfferedCourses.map((c) => ({ termName: c.offeredTermName!, termYear: c.offeredTermYear!, isCurrent: true })),
    ...snapshotTerms.map((s) => ({ termName: s.termName, termYear: s.termYear, isCurrent: false })),
  ].sort((a, b) => b.termYear - a.termYear || a.termName.localeCompare(b.termName));

  // de-duplicate, preferring the "current" flag when both exist for the same term
  const seen = new Map<string, typeof allTerms[number]>();
  for (const t of allTerms) {
    const key = `${t.termName}-${t.termYear}`;
    if (!seen.has(key) || t.isCurrent) seen.set(key, t);
  }
  const terms = Array.from(seen.values());

  const defaultKey = terms[0] ? `${terms[0].termName}_${terms[0].termYear}` : "";
  const selectedKey = searchParams.term || defaultKey;
  const [selectedTermName, selectedTermYearStr] = selectedKey.split("_");
  const selectedTermYear = selectedTermYearStr ? parseInt(selectedTermYearStr, 10) : undefined;
  const selectedIsCurrent = terms.find((t) => t.termName === selectedTermName && t.termYear === selectedTermYear)?.isCurrent || false;

  let rows: { courseLabel: string; courseType: string; batchLabel: string; instructorName: string; sectionCount: number }[] = [];
  if (selectedTermName && selectedTermYear) {
    if (selectedIsCurrent) {
      const courses = await prisma.course.findMany({
        where: { coordinatorId: user.id, isOffered: true, offeredTermName: selectedTermName, offeredTermYear: selectedTermYear },
        include: { batch: true, instructor: true, sectionAssignments: { include: { instructor: true } } },
      });
      for (const c of courses) {
        const label = `${c.code} — ${c.title}`;
        const batchLabel = c.batch ? `${c.batch.degreeProgram} — ${c.batch.batchName}` : "—";
        if (c.sectionAssignments.length > 0) {
          for (const a of c.sectionAssignments) rows.push({ courseLabel: label, courseType: c.courseType, batchLabel, instructorName: a.instructor.name, sectionCount: a.sectionCount });
        } else if (c.instructor) {
          rows.push({ courseLabel: label, courseType: c.courseType, batchLabel, instructorName: c.instructor.name, sectionCount: 1 });
        }
      }
    } else {
      const snapshots = await prisma.assignmentSnapshot.findMany({ where: { coordinatorId: user.id, termName: selectedTermName, termYear: selectedTermYear } });
      rows = snapshots.map((s) => ({ courseLabel: s.courseLabel, courseType: s.courseType, batchLabel: s.batchLabel, instructorName: s.instructorName, sectionCount: s.sectionCount }));
    }
  }

  return (
    <Shell roleLabel="Program Coordinator" userName={user.name} navLinks={NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Assignment History</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Every past semester's course assignments — the current one live, previous ones from an automatic
        snapshot taken right before a course was re-offered for a new term.
      </p>

      <div className="card">
        <form method="GET" style={{ display: "flex", gap: 14, alignItems: "flex-end" }}>
          <div>
            <label style={{ fontSize: 11, color: "var(--slate)", display: "block", marginBottom: 4 }}>Semester</label>
            <select name="term" defaultValue={selectedKey} style={{ padding: "6px 8px", border: "1px solid var(--line)", fontSize: 12.5 }}>
              {terms.map((t) => <option key={`${t.termName}_${t.termYear}`} value={`${t.termName}_${t.termYear}`}>{t.termName} {t.termYear}{t.isCurrent ? " (current)" : ""}</option>)}
            </select>
          </div>
          <button type="submit" className="btn btn-brass">Load</button>
          {selectedTermName && selectedTermYear && (
            <a href={`/api/coordinator/assignment-history/export?termName=${selectedTermName}&termYear=${selectedTermYear}${selectedIsCurrent ? "&current=1" : ""}`} className="btn btn-brass" style={{ textDecoration: "none" }}>
              Export to Excel
            </a>
          )}
        </form>
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <SortableTable>
          <thead><tr><th>Course</th><th>Type</th><th>Batch</th><th>Instructor</th><th>Sections</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} style={{ color: "var(--slate)" }}>No assignment data for this semester.</td></tr>}
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{r.courseLabel}</td><td>{r.courseType}</td><td style={{ fontSize: 11.5 }}>{r.batchLabel}</td>
                <td>{r.instructorName}</td><td>{r.sectionCount}</td>
              </tr>
            ))}
          </tbody>
        </SortableTable>
      </div>
    </Shell>
  );
}
