import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { writeAuditLog } from "../../../../../../lib/audit";
import { cloneGrandCurriculumForChairman } from "../../../../../../lib/cloneCurriculum";

// Super User: which institutes (Institute Heads) an official master curriculum is assigned to.
export async function GET(_req: NextRequest, { params }: { params: { curriculumId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "SUPER_USER") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const curriculum = await prisma.masterCurriculum.findUnique({ where: { id: params.curriculumId } });
  if (!curriculum || curriculum.chairmanId) return NextResponse.json({ error: "official curriculum not found" }, { status: 404 });

  const [chairmen, assigned] = await Promise.all([
    prisma.user.findMany({ where: { role: "CHAIRMAN" }, select: { id: true, name: true, instituteName: true }, orderBy: { name: "asc" } }),
    prisma.curriculumAssignment.findMany({ where: { curriculumId: curriculum.id }, select: { chairmanId: true } }),
  ]);
  const assignedIds = new Set(assigned.map((a) => a.chairmanId));
  return NextResponse.json({
    institutes: chairmen.map((c) => ({ id: c.id, label: c.instituteName || c.name, assigned: assignedIds.has(c.id) })),
  });
}

// Replaces the assignment list. Newly assigned institutes also get their own editable copy;
// un-assigning only stops the official one being offered - an institute's own copy is never deleted.
export async function PUT(req: NextRequest, { params }: { params: { curriculumId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "SUPER_USER") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  if (!Array.isArray(body.chairmanIds)) return NextResponse.json({ error: "chairmanIds is required" }, { status: 400 });

  const curriculum = await prisma.masterCurriculum.findUnique({ where: { id: params.curriculumId } });
  if (!curriculum || curriculum.chairmanId) return NextResponse.json({ error: "official curriculum not found" }, { status: 404 });

  const valid = await prisma.user.findMany({ where: { role: "CHAIRMAN", id: { in: body.chairmanIds as string[] } }, select: { id: true } });
  const wanted = new Set<string>(valid.map((v: { id: string }) => v.id));
  const existing = await prisma.curriculumAssignment.findMany({ where: { curriculumId: curriculum.id } });
  const existingIds = new Set<string>(existing.map((e: { chairmanId: string }) => e.chairmanId));

  const toAdd = Array.from(wanted).filter((id) => !existingIds.has(id));
  const toRemove = Array.from(existingIds).filter((id) => !wanted.has(id));

  if (toRemove.length > 0) await prisma.curriculumAssignment.deleteMany({ where: { curriculumId: curriculum.id, chairmanId: { in: toRemove } } });
  for (const chairmanId of toAdd) {
    await prisma.curriculumAssignment.create({ data: { curriculumId: curriculum.id, chairmanId } });
    await cloneGrandCurriculumForChairman(curriculum, chairmanId);
  }

  await writeAuditLog({
    actorUserId: user.id, action: "CURRICULUM_ASSIGNMENT_UPDATED", entityType: "MasterCurriculum", entityId: curriculum.id,
    metadata: { added: toAdd.length, removed: toRemove.length, total: wanted.size },
  });
  return NextResponse.json({ ok: true, assigned: wanted.size, added: toAdd.length, removed: toRemove.length });
}
