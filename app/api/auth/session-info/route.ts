import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { isDualCapable, DUAL_ROLE_LABEL } from "../../../../lib/dualRoles";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "not logged in" }, { status: 401 });

  const dualCapable = isDualCapable(user.rawRole, user.secondaryRole);
  // The other role this person can switch to right now (a Chairman who also teaches, or a dual-capable Subject Expert).
  const otherRole = dualCapable ? (user.role === "INSTRUCTOR" ? user.rawRole : "INSTRUCTOR") : null;
  const LABELS = DUAL_ROLE_LABEL;
  return NextResponse.json({ dualCapable, otherRole, otherRoleLabel: otherRole ? LABELS[otherRole] : null, activeRole: user.role, isAlumniCustodian: !!user.isAlumniCustodian });
}
