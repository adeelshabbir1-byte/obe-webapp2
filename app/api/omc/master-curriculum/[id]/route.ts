import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { writeAuditLog } from "../../../../../lib/audit";

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

  const body = await req.json();
  const { title, authority, version, status, sourceReference } = body;

  await prisma.masterCurriculum.update({
    where: { id: params.id },
    data: {
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
