import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { writeAuditLog } from "../../../../../../lib/audit";
import { copyMasterClos } from "../../../../../../lib/masterClos";

export const maxDuration = 300;

// OMC: bring the latest CLOs and PLO mapping from the official curriculum into this institute's own copy.
// { onlyEmpty: true } fills only courses that have no CLOs yet; false replaces every course the official copy has CLOs for.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const mine = await prisma.masterCurriculum.findUnique({ where: { id: params.id }, select: { id: true, chairmanId: true, parentCurriculumId: true } });
  if (!mine || mine.chairmanId !== user.managedById) return NextResponse.json({ error: "Only your own copy can be updated." }, { status: 403 });
  if (!mine.parentCurriculumId) return NextResponse.json({ error: "This copy is not linked to an official curriculum." }, { status: 400 });
  const b = await req.json().catch(() => ({}));
  const r = await copyMasterClos(mine.parentCurriculumId, mine.id, { onlyEmpty: b.onlyEmpty !== false });
  await writeAuditLog({ actorUserId: user.id, action: "MASTER_CLOS_PULLED_FROM_OFFICIAL", entityType: "MasterCurriculum", entityId: mine.id, metadata: { courses: r?.courses ?? 0, clos: r?.clos ?? 0 } });
  return NextResponse.json(r);
}
