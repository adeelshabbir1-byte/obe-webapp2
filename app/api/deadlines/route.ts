import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { writeAuditLog } from "../../../lib/audit";
import { COURSE_KINDS, DEADLINE_KINDS, SETTER_ROLES, chairmanOf, reach } from "../../../lib/deadlines";

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !SETTER_ROLES.includes(user.role)) return NextResponse.json({ error: "Only a Dean, Chairman, Program Lead or Institute Head can set deadlines" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  if (!DEADLINE_KINDS[b.kind] || !String(b.title || "").trim() || !b.dueDate) return NextResponse.json({ error: "Choose the person, what is due and the date" }, { status: 400 });
  const due = new Date(b.dueDate);
  if (isNaN(due.getTime())) return NextResponse.json({ error: "That date is not valid" }, { status: 400 });
  const { people, leadIds } = await reach(user);
  const ids = String(b.assigneeId || "").split(",").filter(Boolean);
  if (!ids.length || !ids.every((i) => people.some((p) => p.id === i))) return NextResponse.json({ error: "You can only set deadlines for people in your own area" }, { status: 403 });
  let courseId: string | null = null;
  if (COURSE_KINDS.includes(b.kind)) {
    const c = await prisma.course.findFirst({ where: { id: String(b.courseId || ""), coordinatorId: { in: leadIds.length ? leadIds : ["none"] } }, select: { id: true } });
    if (!c) return NextResponse.json({ error: "Choose the course this deadline is about" }, { status: 400 });
    courseId = c.id;
  }
  const chairmanId = chairmanOf(user);
  for (const assigneeId of ids) {
    const row = await prisma.deadline.create({ data: { chairmanId, assigneeId, setById: user.id, kind: b.kind, title: String(b.title).trim().slice(0, 200), description: String(b.description || "").trim().slice(0, 1000) || null, courseId, dueDate: due } });
    await writeAuditLog({ actorUserId: user.id, action: "DEADLINE_SET", entityType: "Deadline", entityId: row.id });
  }
  return NextResponse.json({ ok: true, created: ids.length }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !SETTER_ROLES.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id") || "";
  const d = await prisma.deadline.findFirst({ where: { id, chairmanId: chairmanOf(user) } });
  if (!d || (user.role !== "CHAIRMAN" && d.setById !== user.id)) return NextResponse.json({ error: "You can only remove deadlines you set" }, { status: 403 });
  await prisma.deadline.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
