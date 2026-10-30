import { NextRequest } from "next/server";
import { sendShortOfTime, shortOfTimePlan } from "../../../../../lib/topicShort";
import { forbidden, reply, wsUser } from "../../../../../lib/topicApi";
import { withErrors } from "../../../../../lib/apiHandler";

// GET ?courseId=&lost=N — "I lost N lectures": topics to drop or shorten, safest first, with their cost (preview).
async function GET_handler(req: NextRequest) {
  const user = await wsUser(["INSTRUCTOR"]);
  if (!user) return forbidden();
  const sp = req.nextUrl.searchParams;
  return reply(await shortOfTimePlan(user, String(sp.get("courseId") || ""), Number(sp.get("lost") || 1)));
}
// POST { courseId, picks: [{id, action: DROP|SHORTEN}], note } — sends it to the Subject Expert for approval.
async function POST_handler(req: NextRequest) {
  const user = await wsUser(["INSTRUCTOR"]);
  if (!user) return forbidden();
  const b = await req.json().catch(() => ({}));
  const picks = Array.isArray(b.picks) ? b.picks.filter((p: { id?: unknown }) => typeof p?.id === "string").map((p: { id: string; action?: string }) => ({ id: p.id, action: p.action === "SHORTEN" ? "SHORTEN" : "DROP" })) : [];
  return reply(await sendShortOfTime(user, String(b.courseId || ""), picks, typeof b.note === "string" ? b.note.slice(0, 1000) : ""));
}
export const GET = withErrors(GET_handler);
export const POST = withErrors(POST_handler);
