import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { writeAuditLog } from "../../../../lib/audit";
import { cloneGrandCurriculumForChairman } from "../../../../lib/cloneCurriculum";
import { degreeGroupLabel, degreeSortKey } from "../../../../lib/degreeGroup";

// Super User, institute-first: pick an institute, tick the curricula it should get, save once.
export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "SUPER_USER") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const chairmanId = new URL(req.url).searchParams.get("chairmanId");

  if (!chairmanId) {
    const chairmen = await prisma.user.findMany({ where: { role: "CHAIRMAN" }, select: { id: true, name: true, instituteName: true }, orderBy: { name: "asc" } });
    const counts = await prisma.curriculumAssignment.groupBy({ by: ["chairmanId"], _count: { _all: true } });
    const countBy = new Map<string, number>(counts.map((c: { chairmanId: string; _count: { _all: number } }) => [c.chairmanId, c._count._all]));
    return NextResponse.json({ institutes: chairmen.map((c) => ({ id: c.id, label: c.instituteName || c.name, assignedCount: countBy.get(c.id) || 0 })) });
  }

  const [curricula, assigned] = await Promise.all([
    prisma.masterCurriculum.findMany({ where: { chairmanId: null } }),
    prisma.curriculumAssignment.findMany({ where: { chairmanId }, select: { curriculumId: true } }),
  ]);
  const assignedIds = new Set<string>(assigned.map((a: { curriculumId: string }) => a.curriculumId));
  const sorted = curricula.sort((a, b) => degreeSortKey(a).localeCompare(degreeSortKey(b)) || a.authority.localeCompare(b.authority) || b.version.localeCompare(a.version));
  return NextResponse.json({
    curricula: sorted.map((c) => ({ id: c.id, title: c.title, authority: c.authority, version: c.version, degreeGroup: degreeGroupLabel(c), assigned: assignedIds.has(c.id) })),
  });
}

// Replaces this institute's curricula. Newly ticked ones also get the institute's own editable copy;
// unticking only stops the official one being offered - an institute's own copy is never deleted.
export async function PUT(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "SUPER_USER") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  if (!body.chairmanId || !Array.isArray(body.curriculumIds)) return NextResponse.json({ error: "chairmanId and curriculumIds are required" }, { status: 400 });

  const chairman = await prisma.user.findFirst({ where: { id: body.chairmanId, role: "CHAIRMAN" } });
  if (!chairman) return NextResponse.json({ error: "institute not found" }, { status: 404 });

  const official = await prisma.masterCurriculum.findMany({ where: { chairmanId: null, id: { in: body.curriculumIds as string[] } } });
  const wanted = new Map<string, (typeof official)[number]>(official.map((c) => [c.id, c]));
  const existing = await prisma.curriculumAssignment.findMany({ where: { chairmanId: chairman.id } });
  const existingIds = new Set<string>(existing.map((e: { curriculumId: string }) => e.curriculumId));

  const toAdd = Array.from(wanted.keys()).filter((id) => !existingIds.has(id));
  const toRemove = Array.from(existingIds).filter((id) => !wanted.has(id));

  if (toRemove.length > 0) await prisma.curriculumAssignment.deleteMany({ where: { chairmanId: chairman.id, curriculumId: { in: toRemove } } });
  for (const id of toAdd) {
    await prisma.curriculumAssignment.create({ data: { curriculumId: id, chairmanId: chairman.id } });
    await cloneGrandCurriculumForChairman(wanted.get(id)!, chairman.id);
  }

  await writeAuditLog({
    actorUserId: user.id, action: "CURRICULUM_ASSIGNMENT_UPDATED", entityType: "User", entityId: chairman.id,
    metadata: { added: toAdd.length, removed: toRemove.length, total: wanted.size },
  });
  return NextResponse.json({ ok: true, total: wanted.size, added: toAdd.length, removed: toRemove.length });
}
