import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { writeAuditLog } from "../../../../../lib/audit";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "CHAIRMAN") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const dept = await prisma.department.findFirst({ where: { id: params.id, chairmanId: user.id } });
  if (!dept) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  if (body.timetableMode !== undefined) {
    if (body.timetableMode !== "SHARED" && body.timetableMode !== "SEPARATE") return NextResponse.json({ error: "timetableMode must be SHARED or SEPARATE" }, { status: 400 });
    const department = await prisma.department.update({ where: { id: dept.id }, data: { timetableMode: body.timetableMode } });
    return NextResponse.json({ department });
  }
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 100) : "";
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  const clash = await prisma.department.findFirst({ where: { chairmanId: user.id, name, id: { not: dept.id } } });
  if (clash) return NextResponse.json({ error: `a department named "${name}" already exists` }, { status: 409 });
  const department = await prisma.department.update({ where: { id: dept.id }, data: { name } });
  return NextResponse.json({ department });
}

// Only an empty department can be deleted - move its people and programs elsewhere first.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "CHAIRMAN") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const dept = await prisma.department.findFirst({ where: { id: params.id, chairmanId: user.id } });
  if (!dept) return NextResponse.json({ error: "not found" }, { status: 404 });
  const [members, programs, courses] = await Promise.all([
    prisma.user.count({ where: { departmentId: dept.id } }),
    prisma.departmentProgram.count({ where: { departmentId: dept.id } }),
    prisma.course.count({ where: { subjectHomeDepartmentId: dept.id } }),
  ]);
  if (members > 0 || programs > 0 || courses > 0) {
    return NextResponse.json({ error: `this department still has ${members} people, ${programs} programs and ${courses} courses tagged to it - move them to another department first` }, { status: 409 });
  }
  await prisma.department.delete({ where: { id: dept.id } });
  await writeAuditLog({ actorUserId: user.id, action: "DEPARTMENT_DELETED", entityType: "Department", entityId: dept.id });
  return NextResponse.json({ ok: true });
}
