import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { writeAuditLog } from "../../../../lib/audit";
import { instituteTerm, termLabel, nextTermLabel } from "../../../../lib/assignerHat";

// The Institute Head gives any teacher the Course Assigner role for a semester (or until removed), or takes it back.
// The teacher keeps all their other roles and picks the hat when they sign in.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || (user.role !== "CHAIRMAN" && user.role !== "HEAD_OF_DEPARTMENT")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const chairmanId = user.role === "CHAIRMAN" ? user.id : user.managedById || "";
  const deptId = user.role === "HEAD_OF_DEPARTMENT" ? user.departmentId || "none" : null;
  const body = await req.json().catch(() => ({}));
  if (!body.userId) return NextResponse.json({ error: "choose a person" }, { status: 400 });

  const person = await prisma.user.findFirst({
    where: {
      id: body.userId, isVisitingPlaceholder: false, isActive: true,
      role: { in: ["INSTRUCTOR", "SUBJECT_EXPERT", "HEAD_OF_DEPARTMENT", "DEAN", "PROGRAM_COORDINATOR", "DEPARTMENT_COORDINATOR"] },
      OR: [{ managedBy: { managedById: chairmanId } }, { managedById: chairmanId }],
      ...(deptId ? { AND: [{ OR: [{ departmentId: deptId }, { departmentId: null, managedBy: { departmentId: deptId } }] }] } : {}),
    },
  });
  if (!person) return NextResponse.json({ error: "person not found" }, { status: 404 });

  let assignerTerm: string | null = null;
  if (body.action !== "REVOKE") {
    const t = await instituteTerm(chairmanId);
    if (body.term === "ALWAYS") assignerTerm = "ALWAYS";
    else if (body.term === "CURRENT" && t) assignerTerm = termLabel(t);
    else if (body.term === "NEXT" && t) assignerTerm = nextTermLabel(t);
    else return NextResponse.json({ error: t ? "choose when the role applies" : "no semester is set yet - choose \"until I remove it\" or set the current semester first" }, { status: 400 });
  }
  await prisma.user.update({ where: { id: person.id }, data: { assignerTerm } });
  await prisma.session.updateMany({ where: { userId: person.id }, data: { activeRole: null } });
  await writeAuditLog({ actorUserId: user.id, action: assignerTerm ? "ASSIGNER_HAT_GIVEN" : "ASSIGNER_HAT_REMOVED", entityType: "User", entityId: person.id, metadata: { term: assignerTerm || "none" } });
  return NextResponse.json({ ok: true });
}
