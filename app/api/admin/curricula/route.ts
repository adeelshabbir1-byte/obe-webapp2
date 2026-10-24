import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { writeAuditLog } from "../../../../lib/audit";
import { adminCan, adminCurriculum, inTeamScope, teamCurriculumWhere } from "../../../../lib/platformTeam";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || !(await adminCan(user, "CURRICULUM"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const curricula = await prisma.masterCurriculum.findMany({
    where: await teamCurriculumWhere(user),
    orderBy: [{ authority: "asc" }, { title: "asc" }, { version: "desc" }],
    include: { _count: { select: { courses: true, plos: true } } },
  });
  return NextResponse.json({ curricula });
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !(await adminCan(user, "CURRICULUM"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  if (!body.authority || !body.title || !body.version) {
    return NextResponse.json({ error: "authority, title, version are required" }, { status: 400 });
  }

  if (!(await inTeamScope(user, { authority: body.authority, title: body.title, chairmanId: null }))) return NextResponse.json({ error: "Outside your national curriculum team's area." }, { status: 403 });
  const existing = await prisma.masterCurriculum.findFirst({ where: { authority: body.authority, title: body.title, version: body.version } });
  if (existing) return NextResponse.json({ error: "a curriculum with this authority/title/version already exists" }, { status: 409 });

  const curriculum = await prisma.masterCurriculum.create({
    data: { authority: body.authority, title: body.title, version: body.version, status: "PUBLISHED", sourceReference: body.sourceReference || null },
  });

  await writeAuditLog({ actorUserId: user.id, action: "MASTER_CURRICULUM_CREATED", entityType: "MasterCurriculum", entityId: curriculum.id });

  return NextResponse.json({ curriculum }, { status: 201 });
}
