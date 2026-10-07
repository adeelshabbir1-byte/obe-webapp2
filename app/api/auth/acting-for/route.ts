import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, setActingFor } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";

// The department Program Coordinator chooses which program (Program Lead) they are working on.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "DEPARTMENT_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  if (body.coordinatorId) {
    const target = await prisma.user.findFirst({ where: { id: body.coordinatorId, role: "PROGRAM_COORDINATOR", departmentId: user.departmentId, managedById: user.managedById } });
    if (!target) return NextResponse.json({ error: "program not found in your department" }, { status: 404 });
  }
  await setActingFor(body.coordinatorId || null);
  return NextResponse.json({ ok: true });
}
