import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "../../../../lib/db";
import { verifyPassword } from "../../../../lib/auth";
import { writeAuditLog } from "../../../../lib/audit";
import { createStudentSession, getAuthenticatedStudent } from "../../../../lib/studentSession";
import { closeSession, refreshShortageFlags } from "../../../../lib/attendance";
import { checkClaim, checkToken, distanceM, issueClaim, networkKeyOf, tokenSessionId } from "../../../../lib/attendanceToken";

export const dynamic = "force-dynamic";

// Students check in by scanning the instructor's QR code.
//   GET  ?t=<token>  — the scan: checks the code and returns what it is for, plus a two-minute claim tied to this device.
//   POST { claim, rollNumber?, password?, lat?, lng?, accuracy? } — the check-in itself.
// A signed-in student is checked in as themselves; otherwise their roll number (and, unless the instructor turned it
// off, their portal password) is needed, and they must be actively enrolled in the course.
// One check-in per student per session; one student per device per session.

const DEVICE_COOKIE = "att_dev";
// A whole class usually shares one public address (campus Wi-Fi), so the limit is per device, with a much looser
// one per address that only stops a flood.
const hits = new Map<string, number[]>();
function over(key: string, limit: number) {
  const now = Date.now();
  const recent = (hits.get(key) || []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 20000) hits.delete(hits.keys().next().value as string);
  return recent.length > limit;
}
const throttled = (ip: string, deviceId: string) => over(`d|${ip}|${deviceId}`, 40) || over(`ip|${ip}`, 900);
const ipOf = (req: NextRequest) => (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "local";
function deviceOf(req: NextRequest) {
  const v = req.cookies.get(DEVICE_COOKIE)?.value;
  return v && /^[a-f0-9]{32}$/.test(v) ? { id: v, fresh: false } : { id: crypto.randomBytes(16).toString("hex"), fresh: true };
}
function reply(body: unknown, status: number, device: { id: string; fresh: boolean }) {
  const res = NextResponse.json(body, { status });
  if (device.fresh) res.cookies.set(DEVICE_COOKIE, device.id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 400 * 86400, path: "/" });
  return res;
}
type Sess = NonNullable<Awaited<ReturnType<typeof prisma.attendanceSession.findUnique>>>;
const closeTime = (s: Sess) => (s.closedAt ? Math.min(s.closedAt.getTime(), s.closesAt.getTime()) : s.closesAt.getTime());
const phaseAt = (s: Sess, t: number) => (t >= closeTime(s) ? "CLOSED" : t - s.startedAt.getTime() < s.presentMinutes * 60_000 ? "PRESENT" : "LATE");
// Times are shown in the institute's local time (UTC+5 unless APP_TZ_OFFSET_MINUTES says otherwise), like the rest of the app.
const TZ_MS = Number(process.env.APP_TZ_OFFSET_MINUTES ?? 300) * 60000;
const hhmm = (d: Date) => new Date(d.getTime() + TZ_MS).toISOString().slice(11, 16);

async function load(id: string | null) {
  if (!id) return null;
  let s = await prisma.attendanceSession.findUnique({ where: { id } }).catch(() => null);
  if (s && s.status === "OPEN" && Date.now() >= s.closesAt.getTime()) { await closeSession(s.id, null); s = await prisma.attendanceSession.findUnique({ where: { id } }); }
  return s;
}
async function describe(s: Sess) {
  const [course, instructor] = await Promise.all([
    prisma.course.findUnique({ where: { id: s.courseId }, select: { code: true, title: true } }),
    prisma.user.findUnique({ where: { id: s.instructorId }, select: { name: true } }),
  ]);
  return { code: course?.code || "", title: course?.title || "", instructor: instructor?.name || "" };
}

export async function GET(req: NextRequest) {
  const device = deviceOf(req);
  if (throttled(ipOf(req), device.id)) return reply({ error: "Too many attempts. Wait a minute and scan again." }, 429, device);
  const token = req.nextUrl.searchParams.get("t") || "";
  const s = await load(tokenSessionId(token));
  if (!s) return reply({ error: "This isn't a valid attendance code. Scan the code on the classroom screen." }, 400, device);
  const info = await describe(s);
  if (s.status !== "OPEN") return reply({ error: `Attendance for ${info.code} has closed.`, course: info }, 410, device);
  const check = checkToken(token, s);
  if (!check.ok) return reply({ error: check.reason === "EXPIRED" ? "That code has already changed. Scan the screen again." : "This isn't a valid attendance code.", course: info }, 400, device);

  const me = await getAuthenticatedStudent();
  let student: { name: string; rollNumber: string; enrolled: boolean; already: string | null } | null = null;
  if (me) {
    const [enrolled, ci] = await Promise.all([
      prisma.studentEnrollment.findFirst({ where: { courseId: s.courseId, studentId: me.id, status: "ACTIVE" }, select: { id: true } }),
      prisma.attendanceCheckin.findUnique({ where: { sessionId_studentId: { sessionId: s.id, studentId: me.id } } }),
    ]);
    student = { name: me.name, rollNumber: me.rollNumber, enrolled: !!enrolled, already: ci && ci.method !== "AUTO_ABSENT" ? ci.status : null };
  }
  return reply({
    ok: true, claim: issueClaim(s, device.id), course: info, phase: phaseAt(s, Date.now()), closesAt: s.closesAt,
    requireLogin: s.requireLogin, needsLocation: s.checkLocation, sameNetwork: s.sameNetwork, student,
  }, 200, device);
}

export async function POST(req: NextRequest) {
  const device = deviceOf(req);
  const ip = ipOf(req);
  if (throttled(ip, device.id)) return reply({ error: "Too many attempts. Wait a minute and try again." }, 429, device);
  const b = await req.json().catch(() => ({}));
  const s = await load(typeof b.claim === "string" ? b.claim.split(".")[0] : null);
  if (!s) return reply({ error: "Scan the code on the classroom screen again." }, 400, device);
  const scannedAt = checkClaim(b.claim, s, device.id);
  if (scannedAt === null) return reply({ error: "Your scan has expired. Scan the code on the screen again." }, 400, device);
  const phase = phaseAt(s, scannedAt);
  const info = await describe(s);
  if (phase === "CLOSED") return reply({ error: `Attendance for ${info.code} had closed when you scanned.` }, 410, device);

  // Who is checking in: the roll number typed in (with password unless switched off), else the signed-in student.
  const roll = String(b.rollNumber || "").trim().slice(0, 40);
  let studentId: string | null = null, studentName = "";
  if (roll) {
    const candidates = await prisma.student.findMany({ where: { rollNumber: roll, enrollments: { some: { courseId: s.courseId, status: "ACTIVE" } } }, select: { id: true, name: true, passwordHash: true, mustChangePassword: true } });
    if (!candidates.length) return reply({ error: `${roll} isn't enrolled in ${info.code}. Check the roll number, or ask your instructor.` }, 404, device);
    if (s.requireLogin) {
      const fails = await prisma.auditLog.count({ where: { action: "STUDENT_LOGIN_FAILED", createdAt: { gte: new Date(Date.now() - 15 * 60_000) }, metadata: { path: ["rollNumber"], equals: roll } } });
      if (fails >= 8) return reply({ error: "Too many wrong passwords. Wait 15 minutes, or ask your instructor to mark you." }, 429, device);
      const password = String(b.password || "");
      let match = null;
      for (const c of candidates) if (c.passwordHash && password && (await verifyPassword(c.passwordHash, password))) { match = c; break; }
      if (!match) {
        await writeAuditLog({ action: "STUDENT_LOGIN_FAILED", metadata: { rollNumber: roll, via: "attendance" } });
        return reply({ error: "Incorrect roll number or password." }, 401, device);
      }
      studentId = match.id; studentName = match.name;
      // Signed in for next time, so the next scan is a single tap.
      await createStudentSession(match.id, ip, req.headers.get("user-agent") || undefined);
      await writeAuditLog({ action: "STUDENT_LOGIN_SUCCESS", metadata: { studentId: match.id, rollNumber: roll, via: "attendance" } });
    } else {
      if (candidates.length > 1) return reply({ error: "More than one student has this roll number in the course. Ask your instructor to mark you." }, 409, device);
      studentId = candidates[0].id; studentName = candidates[0].name;
    }
  } else {
    const me = await getAuthenticatedStudent();
    if (!me) return reply({ error: "Enter your roll number." }, 400, device);
    const enrolled = await prisma.studentEnrollment.findFirst({ where: { courseId: s.courseId, studentId: me.id, status: "ACTIVE" }, select: { id: true } });
    if (!enrolled) return reply({ error: `You aren't enrolled in ${info.code}. If this phone is someone else's, check in with your own roll number.` }, 403, device);
    studentId = me.id; studentName = me.name;
  }

  // Off-site checks the instructor switched on.
  if (s.sameNetwork && s.networkKey && networkKeyOf(ip) !== s.networkKey) return reply({ error: "Connect to the classroom's Wi-Fi and scan again." }, 403, device);
  let distance: number | null = null;
  if (s.checkLocation && s.lat !== null && s.lng !== null) {
    const lat = Number(b.lat), lng = Number(b.lng), acc = Math.min(100, Math.max(0, Number(b.accuracy) || 0));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return reply({ error: "Allow location for this page — the instructor checks that you are in the classroom.", needsLocation: true }, 400, device);
    distance = distanceM({ lat, lng }, { lat: s.lat, lng: s.lng });
    if (distance - acc > s.radiusM) return reply({ error: `You seem to be about ${distance} m from the classroom. Check in from inside, or ask your instructor.` }, 403, device);
  }

  // One check-in per student, one student per device.
  const existing = await prisma.attendanceCheckin.findUnique({ where: { sessionId_studentId: { sessionId: s.id, studentId } } });
  if (existing && existing.method !== "AUTO_ABSENT") {
    if (existing.deviceId && existing.deviceId !== device.id) await prisma.attendanceCheckin.update({ where: { id: existing.id }, data: { duplicateAttempts: { increment: 1 } } });
    const by = existing.method === "MANUAL" ? " by your instructor" : "";
    return reply({ ok: true, already: true, status: existing.status, name: studentName, course: info, message: `You were already marked ${existing.status === "LEAVE" ? "excused" : existing.status.toLowerCase()}${by} at ${hhmm(existing.at)}.` }, 200, device);
  }
  const other = await prisma.attendanceCheckin.findFirst({ where: { sessionId: s.id, deviceId: device.id, NOT: { studentId } }, select: { id: true } });
  if (other) return reply({ error: "This phone has already been used to check in another student for this lecture. Use your own phone, or ask your instructor." }, 409, device);

  const status = phase; // PRESENT or LATE, as at the moment of the scan
  const data = { status, method: roll ? "ROLL" : "QR", at: new Date(scannedAt), ip, deviceId: device.id, userAgent: (req.headers.get("user-agent") || "").slice(0, 200), distanceM: distance };
  try {
    if (existing) await prisma.attendanceCheckin.update({ where: { id: existing.id }, data }); // turned absent while they were signing in
    else await prisma.attendanceCheckin.create({ data: { sessionId: s.id, studentId, ...data } });
  } catch {
    return reply({ ok: true, already: true, status, name: studentName, course: info, message: "You're already checked in." }, 200, device);
  }
  await prisma.attendanceRecord.upsert({
    where: { lectureRowId_studentId: { lectureRowId: s.lectureRowId, studentId } },
    create: { courseId: s.courseId, lectureRowId: s.lectureRowId, studentId, status, markedById: s.instructorId },
    update: { status, markedById: s.instructorId },
  });
  if (s.status !== "OPEN") await refreshShortageFlags(s.courseId, s.chairmanId).catch(() => null);
  return reply({ ok: true, status, name: studentName, course: info, at: data.at, message: `${studentName}, you're marked ${status === "PRESENT" ? "present" : "late"} in ${info.code} at ${hhmm(data.at)}.` }, 200, device);
}
