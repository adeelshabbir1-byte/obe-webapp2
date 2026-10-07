import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { hatsOf, isDualCapable, DUAL_ROLE_LABEL } from "../../../../lib/dualRoles";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "not logged in" }, { status: 401 });

  const dualCapable = isDualCapable(user.rawRole, user.secondaryRole);
  // The other roles this person can switch to right now (e.g. a Dean who also teaches and is a Subject Expert).
  const otherRoles = dualCapable ? hatsOf(user).filter((r) => r !== user.role).map((r) => ({ role: r, label: DUAL_ROLE_LABEL[r] || r })) : [];
  // A department Program Coordinator: the programs of their department they can work on.
  let deptCoordinator = null as null | { actingForId: string | null; programs: { id: string; label: string }[] };
  if (user.role === "DEPARTMENT_COORDINATOR") {
    const leads = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", departmentId: user.departmentId, managedById: user.managedById }, select: { id: true, name: true, leadProgram: true }, orderBy: { name: "asc" } });
    deptCoordinator = { actingForId: user.actingForId, programs: leads.map((l) => ({ id: l.id, label: l.leadProgram ? `${l.leadProgram} (${l.name})` : l.name })) };
  }
  return NextResponse.json({
    deptCoordinator, dualCapable, otherRoles, otherRole: otherRoles[0]?.role || null, otherRoleLabel: otherRoles[0]?.label || null,
    activeRole: user.role, isAlumniCustodian: !!user.isAlumniCustodian,
  });
}
