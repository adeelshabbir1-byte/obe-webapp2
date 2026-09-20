import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { writeAuditLog } from "../../../../../../lib/audit";

export async function PUT(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  const { code, title, creditHours, category, semesterNumber, textbook, catalogDescription, referenceMaterial } = body;

  if (code !== undefined) {
    const existing = await prisma.masterCourse.findUnique({ where: { id: params.courseId } });
    if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (code.trim() !== existing.code) {
      const clash = await prisma.masterCourse.findUnique({ where: { masterCurriculumId_code: { masterCurriculumId: existing.masterCurriculumId, code: code.trim() } } });
      if (clash) return NextResponse.json({ error: `"${code}" already exists in this curriculum` }, { status: 409 });
    }
  }

  await prisma.masterCourse.update({
    where: { id: params.courseId },
    data: {
      ...(code !== undefined && { code: code.trim() }),
      ...(title !== undefined && { title: title.trim() }),
      ...(creditHours !== undefined && { creditHours: Number(creditHours) }),
      ...(category !== undefined && { category }),
      ...(semesterNumber !== undefined && { semesterNumber: semesterNumber === null || semesterNumber === "" ? null : Number(semesterNumber) }),
      ...(textbook !== undefined && { textbook: textbook?.trim() || null }),
      ...(catalogDescription !== undefined && { catalogDescription: catalogDescription?.trim() || null }),
      ...(referenceMaterial !== undefined && { referenceMaterial: referenceMaterial?.trim() || null }),
    },
  });
  await writeAuditLog({ actorUserId: user.id, action: "MASTER_COURSE_UPDATED", entityType: "MasterCourse", entityId: params.courseId, metadata: { code, title, creditHours, category, semesterNumber, textbook } });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Blocked if any real course has already been adopted from this one —
  // deleting it would silently break that traceability link (and the
  // HEC PLO-suggestion lookups that now depend on it) rather than
  // failing loudly.
  const adoptedCount = await prisma.course.count({ where: { masterCourseId: params.courseId } });
  if (adoptedCount > 0) {
    return NextResponse.json({ error: `${adoptedCount} real course(s) are linked to this — unlink them first (Course Equivalence or Content Sync's HEC Course column) before deleting.` }, { status: 409 });
  }

  const masterCourse = await prisma.masterCourse.findUnique({ where: { id: params.courseId } });
  if (masterCourse) {
    await prisma.hecPloSuggestion.deleteMany({ where: { courseCode: masterCourse.code } });
  }
  await prisma.masterCourseTopic.deleteMany({ where: { masterCourseId: params.courseId } });
  await prisma.masterCourseClo.deleteMany({ where: { masterCourseId: params.courseId } });
  await prisma.masterCourse.delete({ where: { id: params.courseId } });
  await writeAuditLog({ actorUserId: user.id, action: "MASTER_COURSE_DELETED", entityType: "MasterCourse", entityId: params.courseId });

  return NextResponse.json({ ok: true });
}
