import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "not logged in" }, { status: 401 });

  const dualCapable = (user.rawRole === "SUBJECT_EXPERT" || user.rawRole === "HEAD_OF_DEPARTMENT") && user.secondaryRole === "INSTRUCTOR";
  // The other role this person can switch to right now (a Head of Department who also teaches, or a dual-capable Subject Expert).
  const otherRole = dualCapable ? (user.role === "INSTRUCTOR" ? user.rawRole : "INSTRUCTOR") : null;
  const LABELS: Record<string, string> = { INSTRUCTOR: "Instructor", SUBJECT_EXPERT: "Subject Expert", HEAD_OF_DEPARTMENT: "Head of Department" };
  return NextResponse.json({ dualCapable, otherRole, otherRoleLabel: otherRole ? LABELS[otherRole] : null, activeRole: user.role, isAlumniCustodian: !!user.isAlumniCustodian });
}
