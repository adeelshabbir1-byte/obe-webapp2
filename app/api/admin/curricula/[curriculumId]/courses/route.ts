import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { writeAuditLog } from "../../../../../../lib/audit";

export async function POST(req: NextRequest, { params }: { params: { curriculumId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "SUPER_USER") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const curriculum = await prisma.masterCurriculum.findUnique({ where: { id: params.curriculumId } });
  if (!curriculum) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json();
  if (!body.code || !body.title || !body.creditHours || !body.category) {
    return NextResponse.json({ error: "code, title, creditHours, category are required" }, { status: 400 });
  }

  const existing = await prisma.masterCourse.findFirst({ where: { masterCurriculumId: curriculum.id, code: body.code } });
  if (existing) return NextResponse.json({ error: "a course with this code already exists in this curriculum" }, { status: 409 });

  const course = await prisma.masterCourse.create({
    data: {
      masterCurriculumId: curriculum.id, code: body.code, title: body.title,
      creditHours: parseInt(body.creditHours, 10), category: body.category,
      semesterNumber: body.semesterNumber ? parseInt(body.semesterNumber, 10) : null,
      textbook: body.textbook || null, catalogDescription: body.catalogDescription || null, referenceMaterial: body.referenceMaterial || null,
    },
  });

  await writeAuditLog({ actorUserId: user.id, action: "MASTER_COURSE_ADDED", entityType: "MasterCourse", entityId: course.id });

  return NextResponse.json({ course }, { status: 201 });
}
