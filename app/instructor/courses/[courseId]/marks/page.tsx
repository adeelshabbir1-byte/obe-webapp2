import { redirect, notFound } from "next/navigation";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import Shell from "../../../../../components/Shell";
import InstructorCourseSubNav from "../../../../../components/InstructorCourseSubNav";
import MarksEntryManager from "../../../../../components/MarksEntryManager";

const NAV = [{ href: "/instructor/courses", label: "My Semester Courses" }, { href: "/omc/reports", label: "Reports" }];

export default async function MarksEntryPage({ params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "INSTRUCTOR") redirect("/dashboard");

  const course = await prisma.course.findUnique({ where: { id: params.courseId } });
  if (!course || course.instructorId !== user.id) notFound();

  const [instruments, enrollments, batchStudentCount] = await Promise.all([
    prisma.assessmentInstrument.findMany({ where: { courseId: course.id, source: "INSTRUCTOR" }, orderBy: [{ type: "asc" }, { label: "asc" }] }),
    prisma.studentEnrollment.findMany({ where: { courseId: course.id }, include: { student: true, } }),
    course.batchId ? prisma.student.count({ where: { batchId: course.batchId } }) : Promise.resolve(0),
  ]);

  const marks = await prisma.studentMark.findMany({ where: { courseId: course.id } });
  const marksByStudent = new Map<string, Record<string, number>>();
  for (const m of marks) {
    const existing = marksByStudent.get(m.studentId) || {};
    existing[m.instrumentId] = m.score;
    marksByStudent.set(m.studentId, existing);
  }

  return (
    <Shell roleLabel="Course Instructor" userName={user.name} navLinks={NAV}>
      <InstructorCourseSubNav courseId={course.id} active="marks" code={course.code} title={course.title} />
      <h2 style={{ fontSize: 16, marginBottom: 12 }}>Marks Entry</h2>
      <div className="card" style={{ borderColor: "var(--brass)" }}>
        <p style={{ fontSize: 12.5, marginBottom: 8 }}>Once marks are entered, view computed grades, CLO/PLO attainment, and set grade cutoffs for this course.</p>
        <a href={`/omc/reports/result-mate?courseId=${course.id}`} className="btn btn-brass" style={{ textDecoration: "none", display: "inline-block" }}>View Results for This Course</a>
      </div>
      <MarksEntryManager
        courseId={course.id}
        instruments={instruments.map((i) => ({ id: i.id, type: i.type, label: i.label, maxScore: i.maxScore }))}
        students={enrollments.map((e) => ({ id: e.student.id, name: e.student.name, rollNumber: e.student.rollNumber, isRepeat: e.isRepeat, marks: marksByStudent.get(e.student.id) || {} }))}
        hasUnenrolledBatchStudents={batchStudentCount > enrollments.length}
      />
    </Shell>
  );
}
