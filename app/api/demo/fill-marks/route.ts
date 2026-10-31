import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { fillSampleMarks } from "../../../../lib/demoReady";
import { withErrors } from "../../../../lib/apiHandler";

export const maxDuration = 60;

// POST { courseId } — "Fill sample marks" (demo institute only): realistic final-exam marks for every student still
// without one, entered as the course's teacher. They can be edited afterwards like any typed mark.
async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  try { return NextResponse.json(await fillSampleMarks(user, String(b.courseId || ""))); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 403 }); }
}
export const POST = withErrors(POST_handler);
