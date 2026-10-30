import { NextRequest, NextResponse } from "next/server";
import { schemeAccess } from "../../../../../../lib/degreeScheme";
import { freezePlannedGrades } from "../../../../../../lib/studentCourseStatus";
import { withErrors } from "../../../../../../lib/apiHandler";

// Save the current target grades as this semester's planned grades (done automatically when registering from the plan).
async function POST_handler(_req: NextRequest, { params }: { params: { studentId: string } }) {
  const access = await schemeAccess(params.studentId);
  if (!access || access.by !== "staff") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const n = await freezePlannedGrades(params.studentId);
  return NextResponse.json({ ok: true, saved: n });
}
export const POST = withErrors(POST_handler);
