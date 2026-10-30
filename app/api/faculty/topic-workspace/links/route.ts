import { NextRequest, NextResponse } from "next/server";
import { answerLink, linkProposalsFor, proposeLink } from "../../../../../lib/topicLinkPlan";
import { forbidden, reply, wsUser, LINK_ROLES } from "../../../../../lib/topicApi";
import { withErrors } from "../../../../../lib/apiHandler";

// Topic links drawn in the workspace: proposals that the Subject Experts of both courses, the Program Lead and (for a
// Strong prerequisite) two OMC members approve.
async function GET_handler() {
  const user = await wsUser(LINK_ROLES);
  if (!user) return forbidden();
  return NextResponse.json(await linkProposalsFor(user));
}
// POST { kind: PREREQ|OVERLAP, level, action: ADD|CHANGE|REMOVE, fromCourseId, fromTopic, toCourseId, toTopic, note }
async function POST_handler(req: NextRequest) {
  const user = await wsUser(LINK_ROLES);
  if (!user) return forbidden();
  const b = await req.json().catch(() => ({}));
  return reply(await proposeLink(user, b));
}
// PATCH { id, approve, reason }
async function PATCH_handler(req: NextRequest) {
  const user = await wsUser(LINK_ROLES);
  if (!user) return forbidden();
  const b = await req.json().catch(() => ({}));
  return reply(await answerLink(user, String(b.id || ""), !!b.approve, typeof b.reason === "string" ? b.reason : ""));
}
export const GET = withErrors(GET_handler);
export const POST = withErrors(POST_handler);
export const PATCH = withErrors(PATCH_handler);
