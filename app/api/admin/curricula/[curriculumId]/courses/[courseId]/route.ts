import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../../lib/session";
import { prisma } from "../../../../../../../lib/db";
import { writeAuditLog } from "../../../../../../../lib/audit";
import { adminCan, adminCurriculum } from "../../../../../../../lib/platformTeam";
import { withErrors } from "../../../../../../../lib/apiHandler";

async function PATCH_handler(req: NextRequest, { params }: { params: { curriculumId: string; courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || !(await adminCurriculum(user, params.curriculumId))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const course = await prisma.masterCourse.findUnique({ where: { id: params.courseId } });
  if (!course || course.masterCurriculumId !== params.curriculumId) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json();
  if (!body.code || !body.title || !body.creditHours || !body.category) {
    return NextResponse.json({ error: "code, title, creditHours, category are required" }, { status: 400 });
  }
  if (body.prerequisiteCourseId && body.prerequisiteCourseId === params.courseId) {
    return NextResponse.json({ error: "a course cannot be its own prerequisite" }, { status: 400 });
  }

  const updated = await prisma.masterCourse.update({
    where: { id: params.courseId },
    data: {
      code: body.code, title: body.title, creditHours: parseInt(body.creditHours, 10),
      category: body.category, domain: body.domain !== undefined ? (body.domain || null) : course.domain,
      semesterNumber: body.semesterNumber ? parseInt(body.semesterNumber, 10) : null,
      textbook: body.textbook !== undefined ? (body.textbook || null) : course.textbook,
      catalogDescription: body.catalogDescription !== undefined ? (body.catalogDescription || null) : course.catalogDescription,
      referenceMaterial: body.referenceMaterial !== undefined ? (body.referenceMaterial || null) : course.referenceMaterial,
      prerequisiteCourseId: body.prerequisiteCourseId !== undefined ? (body.prerequisiteCourseId || null) : course.prerequisiteCourseId,
    },
  });

  await writeAuditLog({ actorUserId: user.id, action: "MASTER_COURSE_EDITED", entityType: "MasterCourse", entityId: params.courseId });

  return NextResponse.json({ course: updated });
}

async function DELETE_handler(req: Request, { params }: { params: { curriculumId: string; courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || !(await adminCurriculum(user, params.curriculumId))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const course = await prisma.masterCourse.findUnique({ where: { id: params.courseId } });
  if (!course || course.masterCurriculumId !== params.curriculumId) return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.masterCourse.delete({ where: { id: params.courseId } });
  await writeAuditLog({ actorUserId: user.id, action: "MASTER_COURSE_DELETED", entityType: "MasterCourse", entityId: params.courseId });

  return NextResponse.json({ ok: true });
}
export const PATCH = withErrors(PATCH_handler);
export const DELETE = withErrors(DELETE_handler);
