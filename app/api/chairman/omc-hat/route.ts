import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { writeAuditLog } from "../../../../lib/audit";

// The Institute Head makes a faculty member an OMC member as well (same login, a role to choose at sign-in), or takes it back.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "CHAIRMAN") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  if (!body.userId) return NextResponse.json({ error: "choose a person" }, { status: 400 });
  const person = await prisma.user.findFirst({
    where: {
      id: body.userId, isVisitingPlaceholder: false, isActive: true,
      role: { in: ["INSTRUCTOR", "SUBJECT_EXPERT", "HEAD_OF_DEPARTMENT", "DEAN", "PROGRAM_COORDINATOR", "DEPARTMENT_COORDINATOR"] },
      OR: [{ managedBy: { managedById: user.id } }, { managedById: user.id }],
    },
  });
  if (!person) return NextResponse.json({ error: "person not found" }, { status: 404 });
  const give = body.action !== "REVOKE";
  await prisma.user.update({ where: { id: person.id }, data: { omcHat: give } });
  await prisma.session.updateMany({ where: { userId: person.id }, data: { activeRole: null } });
  await writeAuditLog({ actorUserId: user.id, action: give ? "OMC_HAT_GIVEN" : "OMC_HAT_REMOVED", entityType: "User", entityId: person.id });
  return NextResponse.json({ ok: true });
}
