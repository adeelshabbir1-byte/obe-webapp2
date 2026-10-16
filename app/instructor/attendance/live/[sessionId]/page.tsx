import { redirect, notFound } from "next/navigation";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import Shell from "../../../../../components/Shell";
import { navForRole } from "../../../../../components/reportNav";
import QrLiveDashboard from "../../../../../components/attendance/QrLiveDashboard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Live attendance" };

export default async function LiveAttendancePage({ params }: { params: { sessionId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "INSTRUCTOR") redirect("/dashboard");
  const s = await prisma.attendanceSession.findUnique({ where: { id: params.sessionId }, select: { courseId: true } }).catch(() => null);
  if (!s) notFound();
  const course = await prisma.course.findUnique({ where: { id: s.courseId }, select: { instructorId: true } });
  if (course?.instructorId !== user.id) notFound();
  return (
    <Shell roleLabel="Course Instructor" userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 12 }}>Live attendance</h1>
      <QrLiveDashboard sessionId={params.sessionId} backHref={`/instructor/courses/${s.courseId}/attendance`} />
    </Shell>
  );
}
