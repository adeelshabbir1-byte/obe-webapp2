import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../../lib/session";
import { prisma } from "../../../../../../../lib/db";
import { writeAuditLog } from "../../../../../../../lib/audit";
import { adminCan, adminCurriculum } from "../../../../../../../lib/platformTeam";
import { withErrors } from "../../../../../../../lib/apiHandler";

async function PATCH_handler(req: NextRequest, { params }: { params: { curriculumId: string; ploId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || !(await adminCurriculum(user, params.curriculumId))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const plo = await prisma.masterPLO.findUnique({ where: { id: params.ploId } });
  if (!plo || plo.masterCurriculumId !== params.curriculumId) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json();
  if (!body.title || !body.description) return NextResponse.json({ error: "title and description are required" }, { status: 400 });

  const updated = await prisma.masterPLO.update({ where: { id: params.ploId }, data: { title: body.title, description: body.description } });
  await writeAuditLog({ actorUserId: user.id, action: "MASTER_PLO_EDITED", entityType: "MasterPLO", entityId: params.ploId });

  return NextResponse.json({ plo: updated });
}

async function DELETE_handler(req: Request, { params }: { params: { curriculumId: string; ploId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || !(await adminCurriculum(user, params.curriculumId))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const plo = await prisma.masterPLO.findUnique({ where: { id: params.ploId } });
  if (!plo || plo.masterCurriculumId !== params.curriculumId) return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.masterPLO.delete({ where: { id: params.ploId } });
  await writeAuditLog({ actorUserId: user.id, action: "MASTER_PLO_DELETED", entityType: "MasterPLO", entityId: params.ploId });

  return NextResponse.json({ ok: true });
}
export const PATCH = withErrors(PATCH_handler);
export const DELETE = withErrors(DELETE_handler);
