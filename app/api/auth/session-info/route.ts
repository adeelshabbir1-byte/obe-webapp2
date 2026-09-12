import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "not logged in" }, { status: 401 });

  const dualCapable = user.rawRole === "SUBJECT_EXPERT" && user.secondaryRole === "INSTRUCTOR";
  return NextResponse.json({ dualCapable, activeRole: user.role, isAlumniCustodian: !!user.isAlumniCustodian });
}
