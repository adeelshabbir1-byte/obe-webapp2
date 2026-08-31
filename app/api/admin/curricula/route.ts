import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { writeAuditLog } from "../../../../lib/audit";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "SUPER_USER") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const curricula = await prisma.masterCurriculum.findMany({
    orderBy: [{ authority: "asc" }, { title: "asc" }, { version: "desc" }],
    include: { _count: { select: { courses: true, plos: true } } },
  });
  return NextResponse.json({ curricula });
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "SUPER_USER") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  if (!body.authority || !body.title || !body.version) {
    return NextResponse.json({ error: "authority, title, version are required" }, { status: 400 });
  }

  const existing = await prisma.masterCurriculum.findFirst({ where: { authority: body.authority, title: body.title, version: body.version } });
  if (existing) return NextResponse.json({ error: "a curriculum with this authority/title/version already exists" }, { status: 409 });

  const curriculum = await prisma.masterCurriculum.create({
    data: { authority: body.authority, title: body.title, version: body.version, status: "PUBLISHED", sourceReference: body.sourceReference || null },
  });

  await writeAuditLog({ actorUserId: user.id, action: "MASTER_CURRICULUM_CREATED", entityType: "MasterCurriculum", entityId: curriculum.id });

  return NextResponse.json({ curriculum }, { status: 201 });
}
