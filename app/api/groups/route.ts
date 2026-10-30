import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { canEvaluate, saveGroups, autoGroups, groupsOf } from "../../../lib/workGroups";
import { withErrors } from "../../../lib/apiHandler";

// POST { courseId, action: "save", groups: [{ name, title, studentIds }] } or { courseId, action: "auto", size }.
async function POST_handler(req: Request) {
  const user = await getAuthenticatedUser();
  const b = await req.json().catch(() => ({}));
  const courseId = String(b.courseId || "");
  if (!user || !(await canEvaluate(user, courseId))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  try {
    if (b.action === "auto") await saveGroups(courseId, user.id, await autoGroups(courseId, Number(b.size) || 4));
    else await saveGroups(courseId, user.id, (Array.isArray(b.groups) ? b.groups : []).map((g: { name?: string; title?: string; studentIds?: string[] }) => ({ name: String(g.name || ""), title: g.title || null, studentIds: Array.isArray(g.studentIds) ? g.studentIds.map(String) : [] })));
    return NextResponse.json({ ok: true, groups: await groupsOf(courseId) });
  } catch { return NextResponse.json({ error: "Groups are not set up yet — the Super User needs to run prisma/migration_groups_labs.sql." }, { status: 500 }); }
}
export const POST = withErrors(POST_handler);
