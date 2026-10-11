import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { writeAuditLog } from "../../../../../../lib/audit";
import { courseAppliesToTrack } from "../../../../../../lib/tracks";
import { studentContext, checkCourses, registerFromPlan, planLock } from "../../../../../../lib/registrationRules";

// Enrolls every student in this batch into every offered, non-elective
// course (Core/IDS/General Education/Lab — never Elective, since a
// student explicitly chooses those themselves) at their own
// currentSemesterNumber. Never touches a student already enrolled in a
// given course, and never touches Elective courses at all.
export const maxDuration = 300;

export async function POST(req: NextRequest, { params }: { params: { batchId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const batch = await prisma.batch.findUnique({ where: { id: params.batchId } });
  if (!batch || batch.coordinatorId !== user.id) return NextResponse.json({ error: "invalid batch" }, { status: 400 });

  const students = await prisma.student.findMany({ where: { batchId: batch.id } });

  // Load everything once instead of querying per student and per course.
  const offered = await prisma.course.findMany({ where: { batchId: batch.id, isOffered: true, courseType: { not: "Elective" } } });
  const existing = await prisma.studentEnrollment.findMany({ where: { studentId: { in: students.map((s) => s.id) } }, select: { studentId: true, courseId: true } });
  const have = new Set(existing.map((e) => `${e.studentId}|${e.courseId}`));

  const toCreate: { studentId: string; courseId: string; isRepeat: boolean }[] = [];
  const perStudent: { studentId: string; name: string; enrolled: number }[] = [];
  // Students with an advisor-locked plan are registered from that plan; students with a low CGPA / on warning or
  // probation and no locked plan are left for their advisor. Everyone else gets the batch's semester courses, within
  // the institute's registration rules (e.g. FYP needs the earned credit hours).
  const fromPlan: { name: string; registered: number; blocked: number }[] = [];
  const waitingForAdvisor: string[] = [];
  const blockedByRules: string[] = [];
  for (const student of students) {
    if (await planLock(student.id)) {
      const r = await registerFromPlan(student.id);
      if (!("error" in r)) fromPlan.push({ name: student.name, registered: r.registered.length, blocked: r.blocked.length });
      continue;
    }
    const ctx = await studentContext(student.id);
    if (ctx && (ctx.standing !== "GOOD_STANDING" || (ctx.cgpa !== null && ctx.cgpa < ctx.policy.lowCgpaThreshold))) { waitingForAdvisor.push(student.name); continue; }
    // Track-aware: a Pre-Medical student gets the shared courses plus the
    // Pre-Medical-only ones (e.g. Maths-I deficiency), never the Non-Medical-only ones.
    const defaultCourses = offered.filter((c) => c.semesterNumber === student.currentSemesterNumber && courseAppliesToTrack(c.trackName, student.track));
    let n = 0;
    const fresh = defaultCourses.filter((c) => !have.has(`${student.id}|${c.id}`));
    const allowed = ctx ? new Set((await checkCourses(ctx, fresh)).ok) : new Set(fresh.map((c) => c.id));
    for (const course of fresh.filter((c) => !allowed.has(c.id))) blockedByRules.push(`${student.name}: ${course.code}`);
    for (const course of defaultCourses) {
      if (have.has(`${student.id}|${course.id}`) || !allowed.has(course.id)) continue;
      toCreate.push({ studentId: student.id, courseId: course.id, isRepeat: false });
      n++;
    }
    if (n > 0) perStudent.push({ studentId: student.id, name: student.name, enrolled: n });
  }
  for (let i = 0; i < toCreate.length; i += 1000) {
    await prisma.studentEnrollment.createMany({ data: toCreate.slice(i, i + 1000), skipDuplicates: true });
  }
  const totalEnrolled = toCreate.length;

  await writeAuditLog({ actorUserId: user.id, action: "DEFAULT_ENROLLMENT_RUN", entityType: "Batch", entityId: batch.id, metadata: { totalEnrolled, studentsAffected: perStudent.length } });

  return NextResponse.json({
    totalEnrolled, studentsAffected: perStudent.length, totalStudents: students.length,
    fromPlan, waitingForAdvisor, blockedByRules: blockedByRules.slice(0, 50),
  });
}
