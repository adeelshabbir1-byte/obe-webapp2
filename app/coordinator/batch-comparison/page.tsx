import { redirect } from "next/navigation";
import SortableTable from "../../../components/SortableTable";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";

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

export default async function BatchComparisonPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "PROGRAM_COORDINATOR") redirect("/dashboard");

  const batches = await prisma.batch.findMany({
    where: { coordinatorId: user.id },
    orderBy: [{ degreeProgram: "asc" }, { batchName: "desc" }],
    include: { courses: true, plos: true },
  });

  const rows = await Promise.all(batches.map(async (b) => {
    const approvedPlos = b.plos.filter((p) => p.status === "approved").length;
    const coursesWithPlo = await prisma.coursePloMapping.groupBy({ by: ["courseId"], where: { course: { batchId: b.id } } });
    return {
      batch: b, totalPlos: b.plos.length, approvedPlos,
      totalCourses: b.courses.length, coursesWithPloCount: coursesWithPlo.length,
    };
  }));

  return (
    <Shell roleLabel="Program Coordinator" userName={user.name} navLinks={NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Batch Comparison</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Side-by-side comparison of every batch — useful for spotting drift between cohorts of the same degree.
      </p>
      <div className="card" style={{ overflowX: "auto" }}>
        <SortableTable>
          <thead><tr><th>Degree Program</th><th>Batch</th><th>Semester 1 Starts</th><th>Students</th><th>Courses</th><th>PLOs Defined</th><th>PLOs Approved</th><th>Courses with a PLO Assigned</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={8} style={{ color: "var(--slate)" }}>No batches yet.</td></tr>}
            {rows.map((r) => (
              <tr key={r.batch.id}>
                <td>{r.batch.degreeProgram}</td><td>{r.batch.batchName}</td><td>{r.batch.startTerm} {r.batch.startYear}</td>
                <td>{r.batch.studentCount}</td><td>{r.totalCourses}</td><td>{r.totalPlos}</td>
                <td>{r.approvedPlos} / {r.totalPlos}</td><td>{r.coursesWithPloCount} / {r.totalCourses}</td>
              </tr>
            ))}
          </tbody>
        </SortableTable>
      </div>
    </Shell>
  );
}
