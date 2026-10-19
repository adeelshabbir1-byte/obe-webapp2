import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { yearAllocation } from "../../../../lib/yearAllocation";

export const maxDuration = 60;

// GET — the forecast offerings and suggested teachers for this term, next term and the summer.
export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || !["COURSE_ASSIGNER", "CHAIRMAN", "HEAD_OF_DEPARTMENT", "DEAN"].includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const u = user.role === "COURSE_ASSIGNER" ? user : { ...user, managedById: user.role === "CHAIRMAN" ? user.id : user.managedById };
  try { return NextResponse.json(await yearAllocation(u)); }
  catch (e) { console.error("full-year", e); return NextResponse.json({ error: "Could not work out the year." }, { status: 500 }); }
}
