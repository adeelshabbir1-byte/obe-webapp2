import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { writeAuditLog } from "../../../../lib/audit";

// Moves one person (coordinator, course assigner, OMC member, head or faculty member) into a department.
export async function PUT(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "CHAIRMAN") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  if (!body.userId || !body.departmentId) return NextResponse.json({ error: "userId and departmentId are required" }, { status: 400 });

  const dept = await prisma.department.findFirst({ where: { id: body.departmentId, chairmanId: user.id } });
  if (!dept) return NextResponse.json({ error: "department not found" }, { status: 404 });

  const target = await prisma.user.findUnique({ where: { id: body.userId } });
  if (!target) return NextResponse.json({ error: "user not found" }, { status: 404 });

  // Must belong to this chairman's own institute: managed by the chairman directly, or by one of their coordinators.
  let inScope = target.managedById === user.id;
  if (!inScope && target.managedById) {
    const manager = await prisma.user.findUnique({ where: { id: target.managedById } });
    inScope = !!manager && manager.managedById === user.id && manager.role === "PROGRAM_COORDINATOR";
  }
  if (!inScope || target.isVisitingPlaceholder) return NextResponse.json({ error: "user not found" }, { status: 404 });

  await prisma.user.update({ where: { id: target.id }, data: { departmentId: dept.id } });
  await writeAuditLog({ actorUserId: user.id, action: "DEPARTMENT_MEMBER_MOVED", entityType: "User", entityId: target.id, metadata: { departmentId: dept.id } });
  return NextResponse.json({ ok: true });
}
