import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";

// Says who owns a room: one department (used by that department's own timetable) or nobody (a common room).
export async function PUT(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "CHAIRMAN") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  if (!body.roomId) return NextResponse.json({ error: "roomId is required" }, { status: 400 });
  const room = await prisma.room.findFirst({ where: { id: body.roomId, chairmanId: user.id } });
  if (!room) return NextResponse.json({ error: "room not found" }, { status: 404 });
  let departmentId: string | null = null;
  if (body.departmentId) {
    const dept = await prisma.department.findFirst({ where: { id: body.departmentId, chairmanId: user.id } });
    if (!dept) return NextResponse.json({ error: "department not found" }, { status: 404 });
    departmentId = dept.id;
  }
  await prisma.room.update({ where: { id: room.id }, data: { departmentId } });
  return NextResponse.json({ ok: true });
}
