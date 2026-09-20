import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { writeAuditLog } from "../../../../../lib/audit";

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  const { masterCurriculumId, code, title, creditHours, category } = body;
  if (!masterCurriculumId || !code?.trim() || !title?.trim() || !creditHours || !category) {
    return NextResponse.json({ error: "masterCurriculumId, code, title, creditHours, and category are required" }, { status: 400 });
  }

  const curriculum = await prisma.masterCurriculum.findUnique({ where: { id: masterCurriculumId } });
  if (!curriculum) return NextResponse.json({ error: "curriculum not found" }, { status: 404 });
  if (curriculum.chairmanId !== user.managedById) {
    return NextResponse.json({ error: "this is the shared official reference copy (or another institution's own copy) — clone it first to make your own editable version" }, { status: 403 });
  }

  const clash = await prisma.masterCourse.findUnique({ where: { masterCurriculumId_code: { masterCurriculumId, code: code.trim() } } });
  if (clash) return NextResponse.json({ error: `"${code}" already exists in this curriculum` }, { status: 409 });

  const course = await prisma.masterCourse.create({
    data: {
      masterCurriculumId, code: code.trim(), title: title.trim(), creditHours: Number(creditHours), category,
      semesterNumber: body.semesterNumber ? Number(body.semesterNumber) : null,
      textbook: body.textbook?.trim() || null, catalogDescription: body.catalogDescription?.trim() || null, referenceMaterial: body.referenceMaterial?.trim() || null,
    },
  });
  await writeAuditLog({ actorUserId: user.id, action: "MASTER_COURSE_CREATED", entityType: "MasterCourse", entityId: course.id, metadata: { code, title } });

  return NextResponse.json({ course });
}
