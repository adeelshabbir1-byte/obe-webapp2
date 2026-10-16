import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { writeAuditLog } from "../../../../../lib/audit";
import { STATUSES, closeSession, phaseOf, refreshShortageFlags } from "../../../../../lib/attendance";
import { issueToken, windowAt } from "../../../../../lib/attendanceToken";

export const dynamic = "force-dynamic";

/** The session, if the signed-in person is its course's instructor. */
async function mine(id: string) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "INSTRUCTOR") return { user: null, s: null };
  const s = await prisma.attendanceSession.findUnique({ where: { id } }).catch(() => null);
  if (!s) return { user, s: null };
  const course = await prisma.course.findUnique({ where: { id: s.courseId }, select: { instructorId: true } });
  return { user, s: course?.instructorId === user.id ? s : null };
}

// GET — the live state: the current QR token (never the key), the phase and its countdown, and the roster.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  let { user, s } = await mine(params.id);
  if (!user || !s) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (s.status === "OPEN" && Date.now() >= s.closesAt.getTime()) {
    await closeSession(s.id, null);
    s = (await prisma.attendanceSession.findUnique({ where: { id: s.id } }))!;
  }
  const now = Date.now();
  const phase = phaseOf(s, now);
  const w = windowAt(s.startedAt, s.rotateSeconds, now);
  const [course, lecture, enrollments, checkins, records] = await Promise.all([
    prisma.course.findUnique({ where: { id: s.courseId }, select: { code: true, title: true } }),
    prisma.lectureRow.findUnique({ where: { id: s.lectureRowId }, select: { lectureNumber: true, topic: true, actualDate: true } }),
    prisma.studentEnrollment.findMany({ where: { courseId: s.courseId, status: "ACTIVE" }, select: { studentId: true, student: { select: { name: true, rollNumber: true } } } }),
    prisma.attendanceCheckin.findMany({ where: { sessionId: s.id } }),
    prisma.attendanceRecord.findMany({ where: { lectureRowId: s.lectureRowId }, select: { studentId: true, status: true } }),
  ]);
  const ci = new Map(checkins.map((c) => [c.studentId, c]));
  const rec = new Map(records.map((r) => [r.studentId, r.status]));
  const roster = enrollments.map((e) => {
    const c = ci.get(e.studentId);
    return {
      studentId: e.studentId, name: e.student.name, rollNumber: e.student.rollNumber,
      status: c?.status || rec.get(e.studentId) || "WAITING", method: c?.method || (rec.has(e.studentId) ? "EARLIER" : null),
      at: c?.at || null, note: c?.note || null, distanceM: c?.distanceM ?? null, duplicateAttempts: c?.duplicateAttempts || 0,
    };
  }).sort((a, b) => a.rollNumber.localeCompare(b.rollNumber, undefined, { numeric: true }));
  const counts = { PRESENT: 0, LATE: 0, ABSENT: 0, LEAVE: 0, WAITING: 0 } as Record<string, number>;
  for (const r of roster) counts[r.status] = (counts[r.status] || 0) + 1;
  const nextChange = phase === "PRESENT" ? s.startedAt.getTime() + s.presentMinutes * 60_000 : phase === "LATE" ? s.closesAt.getTime() : null;
  return NextResponse.json({
    session: {
      id: s.id, status: s.status, startedAt: s.startedAt, closesAt: s.closesAt, closedAt: s.closedAt, presentMinutes: s.presentMinutes, lateMinutes: s.lateMinutes,
      rotateSeconds: s.rotateSeconds, requireLogin: s.requireLogin, sameNetwork: s.sameNetwork, checkLocation: s.checkLocation, radiusM: s.radiusM, absentMarked: s.absentMarked,
    },
    course, lecture, phase, now,
    // A fresh token each window; the screen asks again before the window ends.
    token: phase === "CLOSED" ? null : issueToken(s, w),
    tokenExpiresInMs: phase === "CLOSED" ? null : s.startedAt.getTime() + (w + 1) * s.rotateSeconds * 1000 - now,
    phaseEndsInMs: nextChange ? Math.max(0, nextChange - now) : null,
    roster, counts,
  });
}

// PATCH { action: "close" } | { action: "extend", minutes } | { action: "mark", studentId, status, note? }
// "mark" is the instructor's override (a dead phone, no camera, a late arrival they let in), also after closing.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, s } = await mine(params.id);
  if (!user || !s) return NextResponse.json({ error: "not found" }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  if (b.action === "close") {
    const r = await closeSession(s.id, user.id);
    await writeAuditLog({ actorUserId: user.id, action: "ATTENDANCE_QR_CLOSED", entityType: "AttendanceSession", entityId: s.id, metadata: { absentMarked: r.absent } });
    return NextResponse.json({ ok: true, absent: r.absent });
  }
  if (b.action === "extend") {
    if (s.status !== "OPEN") return NextResponse.json({ error: "This session is already closed." }, { status: 400 });
    const minutes = Math.round(Number(b.minutes));
    if (!(minutes >= 1 && minutes <= 30)) return NextResponse.json({ error: "Extend by 1 to 30 minutes." }, { status: 400 });
    const closesAt = new Date(Math.max(s.closesAt.getTime(), Date.now()) + minutes * 60_000);
    await prisma.attendanceSession.update({ where: { id: s.id }, data: { closesAt, lateMinutes: Math.ceil((closesAt.getTime() - s.startedAt.getTime()) / 60_000) } });
    return NextResponse.json({ ok: true, closesAt });
  }
  if (b.action === "mark") {
    const status = String(b.status || "");
    if (!(STATUSES as readonly string[]).includes(status)) return NextResponse.json({ error: "Choose Present, Late, Absent or Excused." }, { status: 400 });
    const studentId = String(b.studentId || "");
    const enrolled = await prisma.studentEnrollment.findFirst({ where: { courseId: s.courseId, studentId, status: "ACTIVE" }, select: { id: true } });
    if (!enrolled) return NextResponse.json({ error: "That student isn't enrolled in this course." }, { status: 400 });
    const note = String(b.note ?? "").trim().slice(0, 200) || null;
    await prisma.attendanceRecord.upsert({
      where: { lectureRowId_studentId: { lectureRowId: s.lectureRowId, studentId } },
      create: { courseId: s.courseId, lectureRowId: s.lectureRowId, studentId, status, markedById: user.id },
      update: { status, markedById: user.id },
    });
    await prisma.attendanceCheckin.upsert({
      where: { sessionId_studentId: { sessionId: s.id, studentId } },
      create: { sessionId: s.id, studentId, status, method: "MANUAL", note, byUserId: user.id },
      update: { status, method: "MANUAL", note, byUserId: user.id },
    });
    await writeAuditLog({ actorUserId: user.id, action: "ATTENDANCE_MANUAL_MARK", entityType: "AttendanceSession", entityId: s.id, metadata: { studentId, status, note } });
    if (s.status !== "OPEN") await refreshShortageFlags(s.courseId, s.chairmanId).catch(() => null);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
