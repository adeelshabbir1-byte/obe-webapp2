import { NextRequest, NextResponse } from "next/server";
import { schemeAccess } from "../../../../../../lib/degreeScheme";
import { freezePlannedGrades } from "../../../../../../lib/studentCourseStatus";

// Save the current target grades as this semester's planned grades (done automatically when registering from the plan).
export async function POST(_req: NextRequest, { params }: { params: { studentId: string } }) {
  const access = await schemeAccess(params.studentId);
  if (!access || access.by !== "staff") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const n = await freezePlannedGrades(params.studentId);
  return NextResponse.json({ ok: true, saved: n });
}
