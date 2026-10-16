import { redirect, notFound } from "next/navigation";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import Shell from "../../../../../components/Shell";
import InstructorCourseSubNav from "../../../../../components/InstructorCourseSubNav";
import AttendanceManager from "../../../../../components/AttendanceManager";
import QrStartPanel from "../../../../../components/attendance/QrStartPanel";
import { navForRole } from "../../../../../components/reportNav";
import { chairmanIdFor } from "../../../../../lib/reportScope";
import { attendancePolicy, closeDueSessions } from "../../../../../lib/attendance";

export const dynamic = "force-dynamic";

export default async function InstructorAttendancePage({ params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "INSTRUCTOR") redirect("/dashboard");

  const course = await prisma.course.findUnique({ where: { id: params.courseId } });
  if (!course || course.instructorId !== user.id) notFound();

  const lectureRows = await prisma.lectureRow.findMany({ where: { courseId: course.id, source: "INSTRUCTOR" }, orderBy: { lectureNumber: "asc" } });
  const p = await attendancePolicy(await chairmanIdFor(user));
  // QR sessions (none until prisma/migration_qr_attendance.sql has been run).
  let qr: { openId: string | null; recent: { id: string; lecture: string; startedAt: string; status: string; present: number; late: number; absent: number }[] } | null = null;
  try {
    await closeDueSessions({ courseId: course.id });
    const sessions = await prisma.attendanceSession.findMany({ where: { courseId: course.id }, orderBy: { startedAt: "desc" }, take: 6, select: { id: true, lectureRowId: true, status: true, startedAt: true } });
    const counts = sessions.length ? await prisma.attendanceCheckin.groupBy({ by: ["sessionId", "status"], where: { sessionId: { in: sessions.map((s) => s.id) } }, _count: { _all: true } }) : [];
    const n = (id: string, st: string) => counts.find((c) => c.sessionId === id && c.status === st)?._count._all || 0;
    const lecOf = new Map(lectureRows.map((r) => [r.id, r]));
    qr = {
      openId: sessions.find((s) => s.status === "OPEN")?.id || null,
      recent: sessions.map((s) => ({ id: s.id, lecture: `Lec ${lecOf.get(s.lectureRowId)?.lectureNumber ?? "?"} — ${lecOf.get(s.lectureRowId)?.topic ?? ""}`, startedAt: s.startedAt.toISOString(), status: s.status, present: n(s.id, "PRESENT"), late: n(s.id, "LATE"), absent: n(s.id, "ABSENT") })),
    };
  } catch { qr = null; }

  return (
    <Shell roleLabel="Course Instructor" userName={user.name} navLinks={navForRole(user.role)}>
      <InstructorCourseSubNav courseId={course.id} active="attendance" code={course.code} title={course.title} />
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 16 }}>
        Take attendance with a QR code, or mark it per lecture by hand, and track each student&apos;s overall percentage against the institution&apos;s minimum of {p.minPct}%.
      </p>
      {qr && (
        <QrStartPanel
          courseId={course.id}
          lectures={lectureRows.map((r) => ({ id: r.id, held: !!r.actualDate, label: `Week ${r.week}, Lec ${r.lectureNumber} — ${r.topic} (${r.actualDate ? r.actualDate.toISOString().slice(0, 10) : "not held yet"})` }))}
          defaults={{ presentMinutes: p.qrPresentMinutes, lateMinutes: p.qrLateMinutes, rotateSeconds: p.qrRotateSeconds }}
          openId={qr.openId} recent={qr.recent}
        />
      )}
      <AttendanceManager
        courseId={course.id}
        lectureRows={lectureRows.map((r) => ({ id: r.id, week: r.week, lectureNumber: r.lectureNumber, topic: r.topic, actualDate: r.actualDate ? r.actualDate.toISOString().slice(0, 10) : null }))}
      />
    </Shell>
  );
}
