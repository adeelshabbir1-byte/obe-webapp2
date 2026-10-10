import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { writeAuditLog } from "../../../../../../lib/audit";
import { copyMasterClos } from "../../../../../../lib/masterClos";

export const maxDuration = 300;

// GET: the institutes' own copies of this official curriculum (and of its program copies), with how many courses have CLOs.
// POST { fromId, onlyEmpty }: copy one institute's CLOs and PLO mapping into the official curriculum.
async function guard(curriculumId: string) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "SUPER_USER") return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  const c = await prisma.masterCurriculum.findUnique({ where: { id: curriculumId }, select: { id: true, chairmanId: true, parentCurriculumId: true } });
  if (!c || c.chairmanId) return { error: NextResponse.json({ error: "open an official curriculum" }, { status: 400 }) };
  return { user, c };
}

export async function GET(_req: NextRequest, { params }: { params: { curriculumId: string } }) {
  const g = await guard(params.curriculumId); if ("error" in g) return g.error;
  const copies = await prisma.masterCurriculum.findMany({
    where: { chairmanId: { not: null }, OR: [{ parentCurriculumId: g.c.id }, ...(g.c.parentCurriculumId ? [{ parentCurriculumId: g.c.parentCurriculumId }] : [])] },
    select: { id: true, title: true, version: true, chairman: { select: { name: true, instituteName: true } }, courses: { select: { _count: { select: { seedClos: true } } } } },
  });
  return NextResponse.json({ copies: copies.map((x) => ({ id: x.id, label: `${x.chairman?.instituteName || x.chairman?.name || "Institute"} — ${x.title} ${x.version}`, courses: x.courses.length, withClos: x.courses.filter((k) => k._count.seedClos > 0).length })) });
}

export async function POST(req: NextRequest, { params }: { params: { curriculumId: string } }) {
  const g = await guard(params.curriculumId); if ("error" in g) return g.error;
  const b = await req.json().catch(() => ({}));
  const from = await prisma.masterCurriculum.findUnique({ where: { id: String(b.fromId || "") }, select: { id: true, chairmanId: true } });
  if (!from || !from.chairmanId) return NextResponse.json({ error: "choose an institute's copy" }, { status: 400 });
  const r = await copyMasterClos(from.id, g.c.id, { onlyEmpty: b.onlyEmpty === true });
  await writeAuditLog({ actorUserId: g.user.id, action: "OFFICIAL_CLOS_ADOPTED_FROM_INSTITUTE", entityType: "MasterCurriculum", entityId: g.c.id, metadata: { fromId: from.id, courses: r?.courses ?? 0, clos: r?.clos ?? 0 } });
  return NextResponse.json(r);
}
