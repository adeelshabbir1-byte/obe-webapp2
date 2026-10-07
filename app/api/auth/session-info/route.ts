import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { hatsOf, isDualCapable, DUAL_ROLE_LABEL } from "../../../../lib/dualRoles";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "not logged in" }, { status: 401 });

  const dualCapable = isDualCapable(user.rawRole, user.secondaryRole);
  // The other roles this person can switch to right now (e.g. a Dean who also teaches and is a Subject Expert).
  const otherRoles = dualCapable ? hatsOf(user).filter((r) => r !== user.role).map((r) => ({ role: r, label: DUAL_ROLE_LABEL[r] || r })) : [];
  return NextResponse.json({
    dualCapable, otherRoles, otherRole: otherRoles[0]?.role || null, otherRoleLabel: otherRoles[0]?.label || null,
    activeRole: user.role, isAlumniCustodian: !!user.isAlumniCustodian,
  });
}
