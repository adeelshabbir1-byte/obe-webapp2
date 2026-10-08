import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { courseAppliesToTrack } from "../../../lib/tracks";
import { getPassingCriteria } from "../../../lib/passingCriteria";
import Shell from "../../../components/Shell";
import ReportPrintHeader from "../../../components/ReportPrintHeader";

const NAV = [
  { href: "/coordinator/faculty", label: "Teacher Onboarding" }, { href: "/coordinator/faculty-requests", label: "Teachers from Other Departments" }, { href: "/program-moves", label: "Teacher Program Moves" }, { href: "/coordinator/lab-engineers", label: "Lab Engineers" }, { href: "/course-leads", label: "Course Leads" },
  { href: "/coordinator/batches", label: "Degree Programs & Batches" },
  { href: "/coordinator/courses", label: "Courses" },
  { href: "/coordinator/assign-subject-experts", label: "Assign Subject Experts" },
  { href: "/coordinator/elective-options", label: "Elective Options" },
  { href: "/coordinator/custom-categories", label: "Course & Teacher Categories" },
  { href: "/coordinator/out-of-batch-requests", label: "Out-of-Batch Requests" },
  { href: "/coordinator/plos", label: "Program Learning Outcomes" },
  { href: "/coordinator/semester", label: "Current Semester" },
  { href: "/coordinator/timetable", label: "Timetable" },
  { href: "/coordinator/calendar", label: "Calendar & Exam Dates" },
  { href: "/coordinator/students", label: "Students" },
  { href: "/coordinator/bulk-student-upload", label: "Bulk Student Upload (Multi-Batch)" },
  { href: "/coordinator/repeat-offering", label: "Repeat/Summer Offering" },
  { href: "/coordinator/grading-scale", label: "Grading Scale" },
  { href: "/coordinator/assignment-history", label: "Assignment History" },
  { href: "/coordinator/report-bundles", label: "Report Bundles" },
  { href: "/coordinator/program-profile", label: "Program Document" },
  { href: "/coordinator/required-books", label: "Required Textbooks" },
  { href: "/coordinator/student-transcript", label: "Student Transcript" },
  { href: "/coordinator/deficiency-status", label: "Deficiency Courses Status" },
  { href: "/public-library", label: "Public Course Library" },
  { href: "/coordinator/historical-grades-upload", label: "Historical Grades Upload" },
  { href: "/coordinator/stakeholders", label: "Alumni & Employers" },
  { href: "/coordinator/surveys", label: "Feedback Surveys" },
  { href: "/coordinator/load-report", label: "Teacher Load Report" },
  { href: "/coordinator/elective-instructor-report", label: "Elective Instructor Report" },
  { href: "/coordinator/program-semester-map", label: "Program Semester Map" },
  { href: "/coordinator/curriculum-readiness-matrix", label: "Curriculum Readiness Matrix" },
  { href: "/coordinator/semester-health", label: "Semester Health" },
  { href: "/coordinator/batch-comparison", label: "Batch Comparison" },
  { href: "/coordinator/prerequisite-map", label: "Prerequisite Map" },
  { href: "/omc/course-repositioning", label: "Course Repositioning" },
  { href: "/coordinator/feedforward-digest", label: "Feed-Forward Digest" },
  { href: "/omc/reports", label: "OMC Reports" },
];

type CourseStatus = "PASSED" | "FAILED" | "IN_PROGRESS" | "NOT_YET_DUE" | "NOT_TAKEN";
const STATUS_LABEL: Record<CourseStatus, string> = { PASSED: "Passed", FAILED: "Failed — must retake", IN_PROGRESS: "In progress", NOT_YET_DUE: "Not yet due", NOT_TAKEN: "Due — not taken" };
const STATUS_COLOR: Record<CourseStatus, string> = { PASSED: "var(--sage)", FAILED: "var(--rust)", IN_PROGRESS: "var(--slate)", NOT_YET_DUE: "var(--slate)", NOT_TAKEN: "var(--rust)" };

// Non-credit deficiency courses (e.g. HEC Maths-I / Maths-II for pre-medical
// students) never touch GPA, but a student who hasn't passed every one that
// applies to their track is NOT CLEARED for graduation. This lists exactly that.
export default async function DeficiencyStatusPage({ searchParams }: { searchParams: { batchId?: string; show?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "PROGRAM_COORDINATOR") redirect("/dashboard");

  const batches = await prisma.batch.findMany({ where: { coordinatorId: user.id }, orderBy: [{ degreeProgram: "asc" }, { batchName: "desc" }] });
  const batchIds = searchParams.batchId ? batches.filter((b) => b.id === searchParams.batchId).map((b) => b.id) : batches.map((b) => b.id);
  const onlyNotCleared = searchParams.show !== "all";

  const criteria = await getPassingCriteria(user.managedById);
  const deficiencyCourses = await prisma.course.findMany({ where: { batchId: { in: batchIds }, isNonCredit: true }, orderBy: [{ semesterNumber: "asc" }, { code: "asc" }] });
  const students = deficiencyCourses.length === 0 ? [] : await prisma.student.findMany({
    where: { batchId: { in: batchIds } }, include: { batch: true, enrollments: true }, orderBy: [{ batchId: "asc" }, { rollNumber: "asc" }],
  });
  const records = students.length === 0 ? [] : await prisma.studentTranscriptRecord.findMany({
    where: { studentId: { in: students.map((s) => s.id) }, courseCode: { in: Array.from(new Set(deficiencyCourses.map((c) => c.code))) } },
  });

  const rows = students.map((s) => {
    const applicable = deficiencyCourses.filter((c) => c.batchId === s.batchId && courseAppliesToTrack(c.trackName, s.track));
    const items = applicable.map((c) => {
      const recs = records.filter((r) => r.studentId === s.id && r.courseCode === c.code);
      const passed = recs.some((r) => r.grade === "P");
      const enrolled = s.enrollments.some((e) => e.courseId === c.id && e.status !== "WITHDRAWN");
      let status: CourseStatus;
      if (passed) status = "PASSED";
      else if (enrolled) status = "IN_PROGRESS";
      else if (recs.length > 0) status = "FAILED";
      else if ((c.semesterNumber ?? 0) > s.currentSemesterNumber) status = "NOT_YET_DUE";
      else status = "NOT_TAKEN";
      return { code: c.code, title: c.title, status };
    });
    return { student: s, items, cleared: items.every((i) => i.status === "PASSED") };
  }).filter((r) => r.items.length > 0);

  const shownRows = onlyNotCleared ? rows.filter((r) => !r.cleared) : rows;
  const notClearedCount = rows.filter((r) => !r.cleared).length;
  const base = searchParams.batchId ? `?batchId=${searchParams.batchId}&` : "?";

  return (
    <Shell roleLabel="Program Lead" userName={user.name} navLinks={NAV}>
      <ReportPrintHeader title="Deficiency Courses Status" />
      <h1 style={{ fontSize: 22, marginBottom: 6 }}>Deficiency Courses Status</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 16 }}>
        Non-credit deficiency courses (for example Maths-I and Maths-II for pre-medical students) carry no credit and never affect CGPA.
        A student passes one by scoring at least <strong>{criteria.deficiencyPct}%</strong> (set under Passing Criteria). A student who has not passed every deficiency course that applies to their track is <strong>not cleared for graduation</strong>.
      </p>

      <div className="card" style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", fontSize: 12.5 }}>
        <span>Batch:</span>
        <a href={`?show=${searchParams.show || ""}`} style={{ fontWeight: searchParams.batchId ? 400 : 700 }}>All</a>
        {batches.map((b) => <a key={b.id} href={`?batchId=${b.id}&show=${searchParams.show || ""}`} style={{ fontWeight: searchParams.batchId === b.id ? 700 : 400 }}>{b.degreeProgram} — {b.batchName}</a>)}
        <span style={{ marginLeft: "auto" }}>
          <a href={`${base}show=${onlyNotCleared ? "all" : ""}`}>{onlyNotCleared ? "Show every student" : "Show only not-cleared"}</a>
        </span>
      </div>

      {deficiencyCourses.length === 0 ? (
        <div className="card" style={{ color: "var(--slate)", fontSize: 13 }}>No non-credit deficiency courses exist in the selected batches. Mark a course as Non-credit under Courses to start tracking it.</div>
      ) : (
        <div className="card">
          <p style={{ fontSize: 12.5, marginBottom: 10 }}><strong>{notClearedCount}</strong> of {rows.length} student(s) with deficiency courses are not cleared for graduation.</p>
          <table>
            <thead><tr><th>Student</th><th>Roll No.</th><th>Batch</th><th>Track</th><th>Deficiency courses</th><th>Graduation</th></tr></thead>
            <tbody>
              {shownRows.length === 0 && <tr><td colSpan={6} style={{ color: "var(--slate)" }}>Nobody to show.</td></tr>}
              {shownRows.map((r) => (
                <tr key={r.student.id}>
                  <td>{r.student.name}</td><td>{r.student.rollNumber}</td>
                  <td>{r.student.batch.degreeProgram} — {r.student.batch.batchName}</td><td>{r.student.track}</td>
                  <td>{r.items.map((i) => <div key={i.code} style={{ fontSize: 12 }}>{i.code} {i.title}: <strong style={{ color: STATUS_COLOR[i.status] }}>{STATUS_LABEL[i.status]}</strong></div>)}</td>
                  <td style={{ fontWeight: 700, color: r.cleared ? "var(--sage)" : "var(--rust)" }}>{r.cleared ? "Cleared" : "NOT CLEARED"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}
