import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { WORKSPACE_ROLES } from "../../../../../lib/facultyTopicWorkspace";
import { overlapsFor } from "../../../../../lib/topicOverlaps";
import { withErrors } from "../../../../../lib/apiHandler";

export const maxDuration = 60;

// Overlapping topics and the prerequisite chain of one course (Topic Workspace graph).
async function GET_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !WORKSPACE_ROLES.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const r = await overlapsFor(user, req.nextUrl.searchParams.get("courseId") || "");
  if (!r) return NextResponse.json({ error: "course not found" }, { status: 404 });
  return NextResponse.json(r);
}
export const GET = withErrors(GET_handler);
