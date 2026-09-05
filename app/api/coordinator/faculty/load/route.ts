import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { writeAuditLog } from "../../../../../lib/audit";

export async function PUT(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  if (!body.userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

  const faculty = await prisma.user.findUnique({ where: { id: body.userId } });
  if (!faculty || faculty.managedById !== user.id) return NextResponse.json({ error: "not found" }, { status: 404 });

  const updated = await prisma.user.update({
    where: { id: body.userId },
    data: {
      normalLoad: body.normalLoad !== undefined ? parseInt(body.normalLoad, 10) : faculty.normalLoad,
      externalLoadCount: body.externalLoadCount !== undefined ? parseInt(body.externalLoadCount, 10) : faculty.externalLoadCount,
      externalLoadNote: body.externalLoadNote !== undefined ? body.externalLoadNote || null : faculty.externalLoadNote,
      specialization: body.specialization !== undefined ? body.specialization || null : faculty.specialization,
    },
  });

  await writeAuditLog({ actorUserId: user.id, action: "FACULTY_LOAD_UPDATED", entityType: "User", entityId: body.userId });

  const { passwordHash, ...safe } = updated;
  return NextResponse.json({ user: safe });
}
