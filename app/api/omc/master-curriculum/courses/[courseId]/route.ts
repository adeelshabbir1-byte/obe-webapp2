import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { writeAuditLog } from "../../../../../../lib/audit";

async function requireOwnedCourse(courseId: string, chairmanId: string | null) {
  const course = await prisma.masterCourse.findUnique({ where: { id: courseId }, include: { masterCurriculum: true } });
  if (!course) return { error: "not found" as const, status: 404 };
  if (course.masterCurriculum.chairmanId !== chairmanId) {
    return { error: "this belongs to the shared official reference copy (or another institution's own copy) — clone the curriculum first to make your own editable version", status: 403 as const };
  }
  return { course };
}

export async function PUT(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const owned = await requireOwnedCourse(params.courseId, user.managedById);
  if ("error" in owned) return NextResponse.json({ error: owned.error }, { status: owned.status });
  const existing = owned.course;

  const body = await req.json();
  const { code, title, creditHours, category, semesterNumber, textbook, catalogDescription, referenceMaterial } = body;

  if (code !== undefined && code.trim() !== existing.code) {
    const clash = await prisma.masterCourse.findUnique({ where: { masterCurriculumId_code: { masterCurriculumId: existing.masterCurriculumId, code: code.trim() } } });
    if (clash) return NextResponse.json({ error: `"${code}" already exists in this curriculum` }, { status: 409 });
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

  const owned = await requireOwnedCourse(params.courseId, user.managedById);
  if ("error" in owned) return NextResponse.json({ error: owned.error }, { status: owned.status });
  const masterCourse = owned.course;

  // Blocked if any real course has already been adopted from this one —
  // deleting it would silently break that traceability link (and the
  // HEC PLO-suggestion lookups that now depend on it) rather than
  // failing loudly.
  const adoptedCount = await prisma.course.count({ where: { masterCourseId: params.courseId } });
  if (adoptedCount > 0) {
    return NextResponse.json({ error: `${adoptedCount} real course(s) are linked to this — unlink them first (Course Equivalence or Content Sync's HEC Course column) before deleting.` }, { status: 409 });
  }

  // HecPloSuggestion is keyed by bare course code, and the SAME code can
  // exist on other MasterCourse rows too — the official curriculum's
  // own course with this code, or another chairman's clone. Only wipe
  // the suggestions if this was genuinely the last MasterCourse
  // anywhere still using this code; otherwise deleting one clone's
  // course would silently destroy suggestion data shared by everyone
  // else still using that same code.
  const otherUsersOfCode = await prisma.masterCourse.count({ where: { code: masterCourse.code, id: { not: params.courseId } } });
  if (otherUsersOfCode === 0) {
    await prisma.hecPloSuggestion.deleteMany({ where: { courseCode: masterCourse.code } });
  }
  await prisma.masterCourseTopic.deleteMany({ where: { masterCourseId: params.courseId } });
  await prisma.masterCourseClo.deleteMany({ where: { masterCourseId: params.courseId } });
  await prisma.masterCourse.delete({ where: { id: params.courseId } });
  await writeAuditLog({ actorUserId: user.id, action: "MASTER_COURSE_DELETED", entityType: "MasterCourse", entityId: params.courseId });

  return NextResponse.json({ ok: true });
}
