import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { writeAuditLog } from "../../../../lib/audit";
import { loadWorkspace, saveWorkspace, WORKSPACE_ROLES } from "../../../../lib/facultyTopicWorkspace";

export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !WORKSPACE_ROLES.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const ids = (req.nextUrl.searchParams.get("courseIds") || "").split(",").filter(Boolean);
  const r = await loadWorkspace(user, ids);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json(r);
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !WORKSPACE_ROLES.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const layout = Array.isArray(b.courses) ? b.courses.map((c: any) => ({ courseId: String(c.courseId || ""), rowIds: Array.isArray(c.rowIds) ? c.rowIds.map(String) : [] })) : [];
  const r = await saveWorkspace(user, layout);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: 400 });
  await writeAuditLog({ actorUserId: user.id, action: "LECTURE_TOPICS_REARRANGED", entityType: "Course", entityId: layout[0]?.courseId || "", metadata: { courseIds: layout.map((l: { courseId: string }) => l.courseId).join(","), moved: r.moved } });
  return NextResponse.json(r);
}
