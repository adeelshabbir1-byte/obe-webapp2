import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { referenceCourses, WORKSPACE_ROLES } from "../../../../../lib/facultyTopicWorkspace";

// Search the institute's courses to open one for reference in the Topic Workspace.
export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !WORKSPACE_ROLES.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json({ courses: await referenceCourses(user, (req.nextUrl.searchParams.get("q") || "").slice(0, 80)) });
}
