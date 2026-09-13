import { redirect, notFound } from "next/navigation";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import Shell from "../../../../../components/Shell";
import InstructorCourseSubNav from "../../../../../components/InstructorCourseSubNav";
import AttendanceManager from "../../../../../components/AttendanceManager";

const NAV = [{ href: "/instructor/courses", label: "My Semester Courses" }, { href: "/omc/reports", label: "Reports" }];

export default async function InstructorAttendancePage({ params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "INSTRUCTOR") redirect("/dashboard");

  const course = await prisma.course.findUnique({ where: { id: params.courseId } });
  if (!course || course.instructorId !== user.id) notFound();

  const lectureRows = await prisma.lectureRow.findMany({ where: { courseId: course.id, source: "INSTRUCTOR" }, orderBy: { lectureNumber: "asc" } });

  return (
    <Shell roleLabel="Course Instructor" userName={user.name} navLinks={NAV}>
      <InstructorCourseSubNav courseId={course.id} active="attendance" code={course.code} title={course.title} />
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 16 }}>
        Mark attendance per lecture, and track each student's overall percentage against the institution's minimum.
      </p>
      <AttendanceManager
        courseId={course.id}
        lectureRows={lectureRows.map((r) => ({ id: r.id, week: r.week, lectureNumber: r.lectureNumber, topic: r.topic, actualDate: r.actualDate ? r.actualDate.toISOString().slice(0, 10) : null }))}
      />
    </Shell>
  );
}
