import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { writeAuditLog } from "../../../lib/audit";

// Divides a department's faculty into programs: a faculty member belongs to the coordinator / Program Lead
// who looks after their program. The Institute Head can move anyone; a Chairman only within their own department.
export async function PUT(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || (user.role !== "CHAIRMAN" && user.role !== "HEAD_OF_DEPARTMENT")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (user.role === "HEAD_OF_DEPARTMENT") return NextResponse.json({ error: "A Chairman asks for a move on the Teacher Program Moves page; both Program Leads must accept it." }, { status: 403 });
  const chairmanId = user.role === "CHAIRMAN" ? user.id : user.managedById || "";
  const body = await req.json().catch(() => ({}));
  if (!body.userId || !body.coordinatorId) return NextResponse.json({ error: "userId and coordinatorId are required" }, { status: 400 });

  const target = await prisma.user.findFirst({ where: { id: body.userId, role: { in: ["INSTRUCTOR", "SUBJECT_EXPERT", "LAB_ENGINEER"] }, isVisitingPlaceholder: false, managedBy: { managedById: chairmanId, role: "PROGRAM_COORDINATOR" } } });
  if (!target) return NextResponse.json({ error: "faculty member not found" }, { status: 404 });
  const coordinator = await prisma.user.findFirst({ where: { id: body.coordinatorId, role: "PROGRAM_COORDINATOR", managedById: chairmanId } });
  if (!coordinator) return NextResponse.json({ error: "coordinator not found" }, { status: 404 });
  if (user.role === "HEAD_OF_DEPARTMENT" && (coordinator.departmentId !== user.departmentId || target.departmentId !== user.departmentId)) {
    return NextResponse.json({ error: "you can only move faculty within your own department" }, { status: 403 });
  }

  await prisma.user.update({ where: { id: target.id }, data: { managedById: coordinator.id, departmentId: coordinator.departmentId } });
  await writeAuditLog({ actorUserId: user.id, action: "FACULTY_MOVED_TO_PROGRAM", entityType: "User", entityId: target.id, metadata: { coordinatorId: coordinator.id } });
  return NextResponse.json({ ok: true });
}
