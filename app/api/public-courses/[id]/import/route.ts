import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { writeAuditLog } from "../../../../../lib/audit";
import { blockedAsNonBaseCourse, syncCourseContentToLinkedCourses } from "../../../../../lib/contentSync";
import { applySnapshot, eligibleCourses, Snapshot } from "../../../../../lib/publicCourse";

// Imports a public course into one of the caller's own courses as an independent, editable copy.
// Subject Experts and Coordinators fill the course's Subject Expert plan; an Instructor fills his own delivery plan.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || !["SUBJECT_EXPERT", "INSTRUCTOR", "PROGRAM_COORDINATOR"].includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const pc = await prisma.publicCourse.findUnique({ where: { id: params.id } });
  if (!pc || pc.status !== "PUBLIC") return NextResponse.json({ error: "that course isn't available" }, { status: 404 });

  const body = await req.json();
  const target = (await eligibleCourses(user)).find((c) => c.id === body?.targetCourseId);
  if (!target) return NextResponse.json({ error: "you can only import into one of your own courses" }, { status: 403 });

  if (target.plan === "SE") {
    const blocked = await blockedAsNonBaseCourse(target.id);
    if (blocked) return NextResponse.json({ error: blocked }, { status: 409 });
  }
  const marks = await prisma.studentMark.count({ where: { courseId: target.id } });
  if (marks > 0) return NextResponse.json({ error: `This course already has ${marks} entered student mark(s). Importing would delete graded work, so it has been blocked.` }, { status: 409 });
  if (target.plan === "INSTRUCTOR") {
    const attendance = await prisma.attendanceRecord.count({ where: { courseId: target.id } });
    if (attendance > 0) return NextResponse.json({ error: "Attendance has already been taken for this course, so its lecture plan can't be replaced." }, { status: 409 });
  }
  const existing = await prisma.cLO.count({ where: { courseId: target.id, source: target.plan } });
  if (existing > 0 && !body?.confirmReplace) {
    return NextResponse.json({ error: "This course already has a plan. Importing replaces its CLOs, lecture plan and assessments.", needsConfirm: true }, { status: 409 });
  }

  const result = await applySnapshot(JSON.parse(pc.snapshotJson) as Snapshot, target.id, target.plan, user.id);
  if (!result) return NextResponse.json({ error: "course not found" }, { status: 404 });

  await prisma.publicCourseImport.create({ data: { publicCourseId: pc.id, importedById: user.id, importedIntoCourseId: target.id } });
  await prisma.publicCourse.update({ where: { id: pc.id }, data: { importCount: { increment: 1 } } });
  await writeAuditLog({ actorUserId: user.id, action: "PUBLIC_COURSE_IMPORTED", entityType: "Course", entityId: target.id, metadata: { publicCourseId: pc.id, version: pc.version, ...result } });
  if (target.plan === "SE") await syncCourseContentToLinkedCourses(target.id);

  return NextResponse.json({ ok: true, ...result });
}
