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
  if (!body.number || !body.title || !body.description) {
    return NextResponse.json({ error: "number, title, description are required" }, { status: 400 });
  }

  const existing = await prisma.masterPLO.findFirst({ where: { masterCurriculumId: curriculum.id, number: parseInt(body.number, 10) } });
  if (existing) return NextResponse.json({ error: "a PLO with this number already exists" }, { status: 409 });

  const plo = await prisma.masterPLO.create({
    data: { masterCurriculumId: curriculum.id, number: parseInt(body.number, 10), title: body.title, description: body.description },
  });

  await writeAuditLog({ actorUserId: user.id, action: "MASTER_PLO_ADDED", entityType: "MasterPLO", entityId: plo.id });

  return NextResponse.json({ plo }, { status: 201 });
}
