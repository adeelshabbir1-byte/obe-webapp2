import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { writeAuditLog } from "../../../../lib/audit";
import { loadWorkspace, saveWorkspace, WORKSPACE_ROLES } from "../../../../lib/facultyTopicWorkspace";

export const maxDuration = 120;
const ids = (v: string | null) => (v || "").split(",").map((s) => s.trim()).filter(Boolean);

export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !WORKSPACE_ROLES.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const r = await loadWorkspace(user, ids(req.nextUrl.searchParams.get("courseIds")), ids(req.nextUrl.searchParams.get("referenceIds")));
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json(r);
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !WORKSPACE_ROLES.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  // Each course: its topics in order — existing lecture rows by id, topics copied from a reference course as text.
  const layout = Array.isArray(b.courses) ? b.courses.map((c: any) => ({
    courseId: String(c.courseId || ""),
    items: Array.isArray(c.items)
      ? c.items.map((i: any) => (i && i.id ? { id: String(i.id) } : { topic: String(i?.topic || ""), subtopic: i?.subtopic ? String(i.subtopic) : null }))
      : Array.isArray(c.rowIds) ? c.rowIds.map((id: unknown) => ({ id: String(id) })) : [],
  })) : [];
  const r = await saveWorkspace(user, layout);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: 400 });
  await writeAuditLog({ actorUserId: user.id, action: "LECTURE_TOPICS_REARRANGED", entityType: "Course", entityId: layout[0]?.courseId || "", metadata: { courseIds: layout.map((l: { courseId: string }) => l.courseId).join(","), moved: r.moved, copied: r.copied } });
  return NextResponse.json(r);
}
