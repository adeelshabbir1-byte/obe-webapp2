import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { writeAuditLog } from "../../../../../../lib/audit";

export async function POST(req: NextRequest, { params }: { params: { curriculumId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "SUPER_USER") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const source = await prisma.masterCurriculum.findUnique({
    where: { id: params.curriculumId },
    include: { courses: true, plos: true },
  });
  if (!source) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json();
  if (!body.newVersion) return NextResponse.json({ error: "newVersion is required" }, { status: 400 });

  const existing = await prisma.masterCurriculum.findFirst({
    where: { authority: source.authority, title: source.title, version: body.newVersion },
  });
  if (existing) return NextResponse.json({ error: "that version already exists" }, { status: 409 });

  const clone = await prisma.masterCurriculum.create({
    data: {
      authority: source.authority, title: source.title, version: body.newVersion,
      status: "PUBLISHED", sourceReference: body.sourceReference || source.sourceReference,
    },
  });

  await prisma.masterCourse.createMany({
    data: source.courses.map((c) => ({
      masterCurriculumId: clone.id, code: c.code, title: c.title, creditHours: c.creditHours,
      category: c.category, semesterNumber: c.semesterNumber,
    })),
  });
  await prisma.masterPLO.createMany({
    data: source.plos.map((p) => ({ masterCurriculumId: clone.id, number: p.number, title: p.title, description: p.description })),
  });

  await writeAuditLog({ actorUserId: user.id, action: "MASTER_CURRICULUM_CLONED", entityType: "MasterCurriculum", entityId: clone.id, metadata: { sourceId: source.id } });

  return NextResponse.json({ curriculum: clone }, { status: 201 });
}
