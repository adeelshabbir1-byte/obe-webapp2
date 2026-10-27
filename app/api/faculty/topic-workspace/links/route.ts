import { NextRequest, NextResponse } from "next/server";
import { answerLink, linkProposalsFor, proposeLink } from "../../../../../lib/topicLinkPlan";
import { forbidden, reply, wsUser, LINK_ROLES } from "../../../../../lib/topicApi";

// Topic links drawn in the workspace: proposals that the Subject Experts of both courses, the Program Lead and (for a
// Strong prerequisite) two OMC members approve.
export async function GET() {
  const user = await wsUser(LINK_ROLES);
  if (!user) return forbidden();
  return NextResponse.json(await linkProposalsFor(user));
}
// POST { kind: PREREQ|OVERLAP, level, action: ADD|CHANGE|REMOVE, fromCourseId, fromTopic, toCourseId, toTopic, note }
export async function POST(req: NextRequest) {
  const user = await wsUser(LINK_ROLES);
  if (!user) return forbidden();
  const b = await req.json().catch(() => ({}));
  return reply(await proposeLink(user, b));
}
// PATCH { id, approve, reason }
export async function PATCH(req: NextRequest) {
  const user = await wsUser(LINK_ROLES);
  if (!user) return forbidden();
  const b = await req.json().catch(() => ({}));
  return reply(await answerLink(user, String(b.id || ""), !!b.approve, typeof b.reason === "string" ? b.reason : ""));
}
