import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { writeAuditLog } from "../../../../lib/audit";

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "CHAIRMAN") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 100) : "";
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  const clash = await prisma.department.findFirst({ where: { chairmanId: user.id, name } });
  if (clash) return NextResponse.json({ error: `a department named "${name}" already exists` }, { status: 409 });
  const department = await prisma.department.create({ data: { chairmanId: user.id, name } });
  await writeAuditLog({ actorUserId: user.id, action: "DEPARTMENT_CREATED", entityType: "Department", entityId: department.id });
  return NextResponse.json({ department }, { status: 201 });
}
