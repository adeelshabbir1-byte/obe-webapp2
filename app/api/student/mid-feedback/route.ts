import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedStudent } from "../../../../lib/studentSession";
import { submit } from "../../../../lib/midFeedback";
import { withErrors } from "../../../../lib/apiHandler";

export const dynamic = "force-dynamic";

// POST { courseId, pace, clarity, hardestTopic, comment } — a student's anonymous mid-semester feedback (Adeel prompt §6).
async function POST_handler(req: NextRequest) {
  const st = await getAuthenticatedStudent();
  if (!st) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { courseId?: string; pace?: string; clarity?: number; hardestTopic?: string; comment?: string };
  try { await submit(st.id, String(b.courseId || ""), { pace: String(b.pace || ""), clarity: Number(b.clarity), hardestTopic: b.hardestTopic, comment: b.comment }); return NextResponse.json({ ok: true }); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
export const POST = withErrors(POST_handler);
