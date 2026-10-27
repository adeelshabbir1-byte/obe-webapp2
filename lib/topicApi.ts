import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "./session";
import { WORKSPACE_ROLES } from "./facultyTopicWorkspace";

// Who may call the Topic Workspace APIs: Subject Experts and Instructors (and, for link approvals and program-wide
// views, the Program Lead and the OMC).
export const LINK_ROLES = WORKSPACE_ROLES.concat(["PROGRAM_COORDINATOR", "OMC"]);
export async function wsUser(roles: string[] = WORKSPACE_ROLES) {
  const u = await getAuthenticatedUser();
  if (!u || !roles.includes(u.role)) return null;
  return u;
}
export const forbidden = () => NextResponse.json({ error: "forbidden" }, { status: 403 });
export const reply = (r: { status?: number } & Record<string, unknown>) => { const { status, ...rest } = r; return NextResponse.json(rest, { status: status || (rest.error ? 400 : 200) }); };
export function parseOpen(raw: string | null): { courseId: string; plan?: "SE" | "INSTRUCTOR" | null }[] {
  try {
    const v = JSON.parse(raw || "[]");
    return Array.isArray(v) ? v.filter((x) => x && typeof x.courseId === "string").map((x) => ({ courseId: x.courseId, plan: x.plan === "SE" || x.plan === "INSTRUCTOR" ? x.plan : null })) : [];
  } catch { return []; }
}
