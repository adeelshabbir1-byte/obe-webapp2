import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { writeAuditLog } from "../../../../lib/audit";
import { requireInstructorCourse } from "../../../../lib/instructorGuard";
import { chairmanIdFor } from "../../../../lib/reportScope";
import { dayKey } from "../../../../lib/inactivity";
import { attendancePolicy, closeDueSessions } from "../../../../lib/attendance";
import { networkKeyOf, newSessionKey } from "../../../../lib/attendanceToken";

const MISSING = "QR attendance needs prisma/migration_qr_attendance.sql to be run in Supabase first.";
const int = (v: unknown, def: number, min: number, max: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def; };

// GET ?courseId= — the course's QR sessions, newest first (the instructor of the course).
export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser();
  const course = await requireInstructorCourse(user, req.nextUrl.searchParams.get("courseId") || "");
  if (!course) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  try {
    await closeDueSessions({ courseId: course.id });
    const sessions = await prisma.attendanceSession.findMany({ where: { courseId: course.id }, orderBy: { startedAt: "desc" }, take: 60, select: { id: true, lectureRowId: true, status: true, startedAt: true, closesAt: true, closedAt: true, absentMarked: true } });
    const counts = await prisma.attendanceCheckin.groupBy({ by: ["sessionId", "status"], where: { sessionId: { in: sessions.map((s) => s.id) } }, _count: { _all: true } });
    return NextResponse.json({ sessions: sessions.map((s) => ({ ...s, counts: Object.fromEntries(counts.filter((c) => c.sessionId === s.id).map((c) => [c.status, c._count._all])) })) });
  } catch {
    return NextResponse.json({ error: MISSING }, { status: 503 });
  }
}

// POST — start a live QR session for one lecture of the course.
// body: { courseId, lectureRowId, presentMinutes?, lateMinutes?, rotateSeconds?, requireLogin?, sameNetwork?, checkLocation?, lat?, lng?, radiusM? }
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  const b = await req.json().catch(() => ({}));
  const course = await requireInstructorCourse(user, String(b.courseId || ""));
  if (!course || !user) return NextResponse.json({ error: "Only the course's instructor can take its attendance." }, { status: 403 });
  const lecture = await prisma.lectureRow.findUnique({ where: { id: String(b.lectureRowId || "") } });
  if (!lecture || lecture.courseId !== course.id || lecture.source !== "INSTRUCTOR") return NextResponse.json({ error: "Choose a lecture of your plan." }, { status: 400 });
  const chairmanId = (await chairmanIdFor(user)) || null;
  const p = await attendancePolicy(chairmanId);
  const presentMinutes = int(b.presentMinutes, p.qrPresentMinutes, 1, 90);
  const lateMinutes = int(b.lateMinutes, p.qrLateMinutes, presentMinutes, 180);
  const rotateSeconds = int(b.rotateSeconds, p.qrRotateSeconds, 10, 30);
  const checkLocation = b.checkLocation === true;
  const lat = Number(b.lat), lng = Number(b.lng);
  if (checkLocation && !(Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180)) {
    return NextResponse.json({ error: "Your location isn't available, so the location check can't be used. Allow location in the browser, or start without it." }, { status: 400 });
  }
  const ip = req.headers.get("x-forwarded-for") || "local";
  try {
    await closeDueSessions({ courseId: course.id });
    const open = await prisma.attendanceSession.findFirst({ where: { courseId: course.id, status: "OPEN" }, select: { id: true } });
    if (open) return NextResponse.json({ error: "A QR session is already running for this course.", openId: open.id }, { status: 409 });
    const now = new Date();
    const s = await prisma.attendanceSession.create({
      data: {
        courseId: course.id, lectureRowId: lecture.id, instructorId: user.id, chairmanId, keyHex: newSessionKey(),
        rotateSeconds, presentMinutes, lateMinutes, requireLogin: b.requireLogin !== false,
        sameNetwork: b.sameNetwork === true, networkKey: b.sameNetwork === true ? networkKeyOf(ip) : null,
        checkLocation, lat: checkLocation ? lat : null, lng: checkLocation ? lng : null, radiusM: int(b.radiusM, 150, 30, 2000),
        startedAt: now, closesAt: new Date(now.getTime() + lateMinutes * 60_000),
      },
    });
    // Taking attendance is when the lecture happened: it becomes the lecture's date in the course log, as when marking by hand.
    if (!lecture.actualDate) await prisma.lectureRow.update({ where: { id: lecture.id }, data: { actualDate: new Date(`${dayKey(now)}T00:00:00.000Z`) } });
    await writeAuditLog({ actorUserId: user.id, action: "ATTENDANCE_QR_STARTED", entityType: "AttendanceSession", entityId: s.id, metadata: { courseId: course.id, lectureRowId: lecture.id, presentMinutes, lateMinutes, rotateSeconds } });
    return NextResponse.json({ ok: true, id: s.id }, { status: 201 });
  } catch {
    return NextResponse.json({ error: MISSING }, { status: 503 });
  }
}
