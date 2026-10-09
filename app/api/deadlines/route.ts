import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { writeAuditLog } from "../../../lib/audit";
import { COURSE_KINDS, DEADLINE_KINDS, KIND_ROLE, ROLE_LABEL, SETTER_ROLES, chairmanOf, reach, topUpStanding } from "../../../lib/deadlines";

/**
 * A deadline belongs to a role / task, whoever holds it ("mode": "role"), or to one named person ("mode": "person").
 * Course work follows the course: the Subject Expert or Instructor the course has at the time.
 */
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !SETTER_ROLES.includes(user.role)) return NextResponse.json({ error: "Only a Dean, Chairman, Program Lead or Institute Head can set deadlines" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  if (!DEADLINE_KINDS[b.kind] || !String(b.title || "").trim() || !b.dueDate) return NextResponse.json({ error: "Say what is due and the date" }, { status: 400 });
  const due = new Date(b.dueDate);
  if (isNaN(due.getTime())) return NextResponse.json({ error: "That date is not valid" }, { status: 400 });
  const { people, leadIds } = await reach(user);

  let courseId: string | null = null;
  const standing = COURSE_KINDS.includes(b.kind) && b.courseId === "ALL" && b.mode !== "person";
  if (COURSE_KINDS.includes(b.kind) && !standing) {
    const c = await prisma.course.findFirst({ where: { id: String(b.courseId || ""), coordinatorId: { in: leadIds.length ? leadIds : ["none"] } }, select: { id: true } });
    if (!c) return NextResponse.json({ error: "Choose the course this deadline is about" }, { status: 400 });
    courseId = c.id;
  }

  let assigneeId: string | null = null;
  let role: string | null = null;
  if (b.mode === "person") {
    assigneeId = String(b.assigneeId || "");
    if (!people.some((p) => p.id === assigneeId)) return NextResponse.json({ error: "You can only set deadlines for people in your own area" }, { status: 403 });
  } else {
    role = KIND_ROLE[b.kind] || String(b.role || "");
    if (standing && !["SUBJECT_EXPERT", "INSTRUCTOR", "PROGRAM_COORDINATOR"].includes(role)) return NextResponse.json({ error: "Course work belongs to the Subject Expert, Instructor or Program Lead" }, { status: 400 });
    if (!ROLE_LABEL[role]) return NextResponse.json({ error: "Choose the role this belongs to" }, { status: 400 });
    if (courseId && !["SUBJECT_EXPERT", "INSTRUCTOR", "PROGRAM_COORDINATOR"].includes(role)) return NextResponse.json({ error: "Course work belongs to the course's Subject Expert, Instructor or Program Lead" }, { status: 400 });
  }
  const row = await prisma.deadline.create({ data: { chairmanId: chairmanOf(user), assigneeId, role, setById: user.id, kind: b.kind, title: String(b.title).trim().slice(0, 200), description: String(b.description || "").trim().slice(0, 1000) || null, courseId, dueDate: due, ...(standing ? { allCourses: true } : {}) } as never });
  if (standing) await topUpStanding(chairmanOf(user));
  await writeAuditLog({ actorUserId: user.id, action: "DEADLINE_SET", entityType: "Deadline", entityId: row.id });
  return NextResponse.json({ ok: true }, { status: 201 });
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
