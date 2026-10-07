import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { writeAuditLog } from "../../../../lib/audit";

async function institute() {
  const user = await getAuthenticatedUser();
  return user && user.role === "CHAIRMAN" ? user : null;
}

// Create a faculty (a group of departments led by a Dean).
export async function POST(req: NextRequest) {
  const user = await institute();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  const dup = await prisma.faculty.findFirst({ where: { chairmanId: user.id, name } });
  if (dup) return NextResponse.json({ error: "a faculty with that name already exists" }, { status: 409 });
  const faculty = await prisma.faculty.create({ data: { chairmanId: user.id, name } });
  await writeAuditLog({ actorUserId: user.id, action: "FACULTY_CREATED", entityType: "Faculty", entityId: faculty.id, metadata: { name } });
  return NextResponse.json({ faculty }, { status: 201 });
}

// Put a department into a faculty (facultyId null = take it out), or rename a faculty.
export async function PUT(req: NextRequest) {
  const user = await institute();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  if (body.departmentId) {
    const dept = await prisma.department.findFirst({ where: { id: body.departmentId, chairmanId: user.id } });
    if (!dept) return NextResponse.json({ error: "department not found" }, { status: 404 });
    if (body.facultyId) {
      const f = await prisma.faculty.findFirst({ where: { id: body.facultyId, chairmanId: user.id } });
      if (!f) return NextResponse.json({ error: "faculty not found" }, { status: 404 });
    }
    await prisma.department.update({ where: { id: dept.id }, data: { facultyId: body.facultyId || null } });
    await writeAuditLog({ actorUserId: user.id, action: "DEPARTMENT_FACULTY_SET", entityType: "Department", entityId: dept.id, metadata: { facultyId: body.facultyId || null } });
    return NextResponse.json({ ok: true });
  }
  if (body.id && typeof body.name === "string" && body.name.trim()) {
    const f = await prisma.faculty.findFirst({ where: { id: body.id, chairmanId: user.id } });
    if (!f) return NextResponse.json({ error: "faculty not found" }, { status: 404 });
    await prisma.faculty.update({ where: { id: f.id }, data: { name: body.name.trim() } });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "departmentId or id+name required" }, { status: 400 });
}

export async function DELETE(req: NextRequest) {
  const user = await institute();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id") || "";
  const f = await prisma.faculty.findFirst({ where: { id, chairmanId: user.id }, include: { deans: true } });
  if (!f) return NextResponse.json({ error: "faculty not found" }, { status: 404 });
  if (f.deans.length > 0) return NextResponse.json({ error: "this faculty still has a Dean - remove the Dean account first" }, { status: 400 });
  await prisma.faculty.delete({ where: { id } }); // its departments simply become "not in a faculty"
  return NextResponse.json({ ok: true });
}
