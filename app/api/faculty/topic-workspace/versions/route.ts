import { NextRequest, NextResponse } from "next/server";
import { accessFor, compareWithLast, undoSession } from "../../../../../lib/topicPlan";
import { forbidden, reply, wsUser } from "../../../../../lib/topicApi";
import { withErrors } from "../../../../../lib/apiHandler";

// GET ?courseId=&plan= — compare with last semester, and the saved versions of the plan.
async function GET_handler(req: NextRequest) {
  const user = await wsUser();
  if (!user) return forbidden();
  const sp = req.nextUrl.searchParams;
  const a = await accessFor(user, String(sp.get("courseId") || ""), sp.get("plan") === "SE" ? "SE" : sp.get("plan") === "INSTRUCTOR" ? "INSTRUCTOR" : null);
  if (!a) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(await compareWithLast(a.planCourseId, a.plan));
}
// POST { undo: sessionId } — undo everything this person saved in that workspace session.
async function POST_handler(req: NextRequest) {
  const user = await wsUser();
  if (!user) return forbidden();
  const b = await req.json().catch(() => ({}));
  if (!b.undo) return NextResponse.json({ error: "unknown action" }, { status: 400 });
  return reply(await undoSession(user, String(b.undo)));
}
export const GET = withErrors(GET_handler);
export const POST = withErrors(POST_handler);
