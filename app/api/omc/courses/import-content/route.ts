import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { copyCourseContent } from "../../../../../lib/benchmarkCopy";
import { writeAuditLog } from "../../../../../lib/audit";

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || (user.role !== "OMC" && user.role !== "CHAIRMAN")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  const { sourceCourseId, targetCourseId } = body;
  if (!sourceCourseId || !targetCourseId) return NextResponse.json({ error: "sourceCourseId and targetCourseId are required" }, { status: 400 });
  if (sourceCourseId === targetCourseId) return NextResponse.json({ error: "Source and target can't be the same course." }, { status: 400 });

  const [targetCourse, sourceCourse] = await Promise.all([
    prisma.course.findUnique({ where: { id: targetCourseId }, include: { coordinator: { select: { managedById: true } } } }),
    prisma.course.findUnique({ where: { id: sourceCourseId }, include: { coordinator: { select: { managedById: true } } } }),
  ]);
  if (!targetCourse) return NextResponse.json({ error: "Target course not found." }, { status: 404 });
  if (!sourceCourse) return NextResponse.json({ error: "Source course not found." }, { status: 404 });
  // Both courses must belong to this user's own institute.
  const myInstitute = user.role === "CHAIRMAN" ? user.id : user.managedById;
  if (targetCourse.coordinator?.managedById !== myInstitute || sourceCourse.coordinator?.managedById !== myInstitute) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Refuse rather than risk it: if any student has already been graded
  // on this course's instruments, clearing them would destroy real,
  // entered marks — not something a content-import should ever do
  // silently.
  const gradedMarkCount = await prisma.studentMark.count({ where: { courseId: targetCourseId } });
  if (gradedMarkCount > 0) {
    return NextResponse.json({ error: `This course already has ${gradedMarkCount} entered student mark(s). Importing would delete graded work, so this has been blocked — clear grades first if you're certain, or use a course that hasn't been graded yet.` }, { status: 409 });
  }
  const [att, ev] = await Promise.all([
    prisma.attendanceRecord.count({ where: { courseId: targetCourseId } }),
    prisma.instrumentEvidence.count({ where: { instrument: { courseId: targetCourseId } } }),
  ]);
  if (att > 0 || ev > 0) return NextResponse.json({ error: "This course already has attendance or uploaded evidence, so its content cannot be replaced." }, { status: 409 });

  // Clear the target's existing content in one step, dependency-ordered, before the clean copy.
  await prisma.$transaction([
    prisma.lectureRowInstrument.deleteMany({ where: { lectureRow: { courseId: targetCourseId } } }),
    prisma.paperDistributionItem.deleteMany({ where: { courseId: targetCourseId } }),
    prisma.lectureRow.deleteMany({ where: { courseId: targetCourseId } }),
    prisma.assessmentInstrument.deleteMany({ where: { courseId: targetCourseId } }),
    prisma.cLO.deleteMany({ where: { courseId: targetCourseId } }),
    prisma.coursePloMapping.deleteMany({ where: { courseId: targetCourseId } }),
  ]);

  const result = await copyCourseContent(sourceCourseId, targetCourseId);
  if (!result) return NextResponse.json({ error: "Source course not found." }, { status: 404 });

  await writeAuditLog({
    actorUserId: user.id, action: "COURSE_CONTENT_IMPORTED", entityType: "Course", entityId: targetCourseId,
    metadata: { sourceCourseId, targetCourseCode: targetCourse.code },
  });

  return NextResponse.json({ ok: true, ...result });
}
