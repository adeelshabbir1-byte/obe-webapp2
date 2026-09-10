import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import RepeatOfferingManager from "../../../components/RepeatOfferingManager";

const NAV = [
  { href: "/coordinator/faculty", label: "Faculty Onboarding" },
  { href: "/coordinator/batches", label: "Degree Programs & Batches" },
  { href: "/coordinator/courses", label: "Courses" },
  { href: "/coordinator/plos", label: "Program Learning Outcomes" },
  { href: "/coordinator/semester", label: "Current Semester" },
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

export default async function RepeatOfferingPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "PROGRAM_COORDINATOR") redirect("/dashboard");

  const [courses, students] = await Promise.all([
    prisma.course.findMany({
      where: { coordinatorId: user.id },
      include: { batch: true, studentEnrollments: { where: { isRepeat: true }, include: { student: { include: { batch: true } } } } },
      orderBy: { code: "asc" },
    }),
    prisma.student.findMany({ where: { batch: { coordinatorId: user.id } }, include: { batch: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <Shell roleLabel="Program Coordinator" userName={user.name} navLinks={NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Repeat / Summer Offering</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Select any course (from any batch, any semester) to offer again for students who need to repeat it,
        and enroll the specific students who'll retake it.
      </p>
      <RepeatOfferingManager
        initialCourses={courses.map((c) => ({
          id: c.id, code: c.code, title: c.title,
          batchLabel: c.batch ? `${c.batch.degreeProgram} — ${c.batch.batchName}` : "—",
          isOffered: c.isOffered, offeredTermName: c.offeredTermName, offeredTermYear: c.offeredTermYear,
          enrolledStudents: c.studentEnrollments.map((e) => ({ id: e.student.id, name: e.student.name, rollNumber: e.student.rollNumber, batchLabel: e.student.batch ? `${e.student.batch.degreeProgram} — ${e.student.batch.batchName}` : "—" })),
        }))}
        allStudents={students.map((s) => ({ id: s.id, name: s.name, rollNumber: s.rollNumber, batchLabel: s.batch ? `${s.batch.degreeProgram} — ${s.batch.batchName}` : "—" }))}
      />
    </Shell>
  );
}
