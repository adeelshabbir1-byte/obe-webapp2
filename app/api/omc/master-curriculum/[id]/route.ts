import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { writeAuditLog } from "../../../../../lib/audit";
import { officialCurriculumIsAssigned } from "../../../../../lib/curriculumAccess";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const curriculum = await prisma.masterCurriculum.findUnique({
    where: { id: params.id },
    include: {
      plos: { orderBy: { number: "asc" } },
      courses: {
        orderBy: [{ semesterNumber: "asc" }, { code: "asc" }],
        include: { seedClos: { orderBy: { orderIndex: "asc" } } },
      },
    },
  });
  if (!curriculum) return NextResponse.json({ error: "not found" }, { status: 404 });
  // Own copies, or an official curriculum the Super User assigned to this institute - nothing else.
  const visible = curriculum.chairmanId === null ? await officialCurriculumIsAssigned(curriculum.id, user.managedById) : curriculum.chairmanId === user.managedById;
  if (!visible) return NextResponse.json({ error: "not found" }, { status: 404 });

  // HecPloSuggestion is keyed by bare course code, not a foreign key to
  // MasterCourse — joined in manually here rather than via a relation.
  const codes = curriculum.courses.map((c) => c.code);
  const suggestions = codes.length > 0 ? await prisma.hecPloSuggestion.findMany({ where: { courseCode: { in: codes } } }) : [];
  const ploNumbersByCode = new Map<string, number[]>();
  for (const s of suggestions) ploNumbersByCode.set(s.courseCode, [...(ploNumbersByCode.get(s.courseCode) || []), s.ploNumber]);

  return NextResponse.json({
    curriculum: {
      id: curriculum.id, title: curriculum.title, authority: curriculum.authority, version: curriculum.version,
      status: curriculum.status, sourceReference: curriculum.sourceReference,
      isOwned: curriculum.chairmanId === user.managedById,
      plos: curriculum.plos,
      courses: curriculum.courses.map((c) => ({
        id: c.id, code: c.code, title: c.title, creditHours: c.creditHours, category: c.category,
        semesterNumber: c.semesterNumber, textbook: c.textbook, catalogDescription: c.catalogDescription, referenceMaterial: c.referenceMaterial,
        seedClos: c.seedClos,
        suggestedPloNumbers: ploNumbersByCode.get(c.code) || [],
      })),
    },
  });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const existing = await prisma.masterCurriculum.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (existing.chairmanId !== user.managedById) {
    return NextResponse.json({ error: "this is the shared official reference copy (or another institution's own copy) — clone it first to make your own editable version" }, { status: 403 });
  }

  const body = await req.json();
  const { authority, status, sourceReference } = body;
  const title = typeof body.title === "string" ? body.title.trim() : undefined;
  const version = typeof body.version === "string" ? body.version.trim() : undefined;
  if (title !== undefined && !title) return NextResponse.json({ error: "the name cannot be empty" }, { status: 400 });
  if (title !== undefined || version !== undefined) {
    const clash = await prisma.masterCurriculum.findFirst({ where: { chairmanId: existing.chairmanId, title: title ?? existing.title, version: version ?? existing.version, id: { not: existing.id } } });
    if (clash) return NextResponse.json({ error: "another curriculum of your institute already has this name and version" }, { status: 409 });
  }
  // Courses are linked to a curriculum through its degree program (falling back to the title). Keep the program fixed
  // when the name changes, so renaming never disconnects the courses or the Excel re-import.
  const keepProgram = title !== undefined && title !== existing.title && !existing.degreeProgram ? { degreeProgram: existing.title } : {};

  await prisma.masterCurriculum.update({
    where: { id: params.id },
    data: {
      ...keepProgram,
      ...(title !== undefined && { title }),
      ...(authority !== undefined && { authority }),
      ...(version !== undefined && { version }),
      ...(status !== undefined && { status }),
      ...(sourceReference !== undefined && { sourceReference }),
    },
  });
  await writeAuditLog({ actorUserId: user.id, action: "MASTER_CURRICULUM_UPDATED", entityType: "MasterCurriculum", entityId: params.id, metadata: { title, authority, version, status, sourceReference } });

  return NextResponse.json({ ok: true });
}
