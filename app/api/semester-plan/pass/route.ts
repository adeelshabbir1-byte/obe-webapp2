import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { writeAuditLog } from "../../../../lib/audit";
import { RANK, SETTER_ROLES, chairmanOf, topUpStanding } from "../../../../lib/deadlines";

/**
 * A Dean, Chairman or Program Lead passes a higher target down to the people in their own area with an earlier date,
 * keeping some slack before the date above them. Setting it again replaces their earlier choice.
 */
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !SETTER_ROLES.includes(user.role) || user.role === "CHAIRMAN") return NextResponse.json({ error: "Only a Dean, Chairman or Program Lead can pass a target on" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const chairmanId = chairmanOf(user);
  const parent = (await prisma.deadline.findFirst({ where: { id: String(b.parentId || ""), chairmanId, allCourses: true } as never })) as unknown as { id: string; planTerm: string | null; planKey: string | null; role: string | null; setById: string; kind: string; title: string; description: string | null; dueDate: Date } | null;
  const due = new Date(b.dueDate);
  if (!parent || isNaN(due.getTime())) return NextResponse.json({ error: "Choose the target and a date" }, { status: 400 });
  const setter = await prisma.user.findUnique({ where: { id: parent.setById }, select: { role: true } });
  if (!setter || (RANK[setter.role] ?? 9) >= (RANK[user.role] ?? 9)) return NextResponse.json({ error: "You can only pass on a target set above you" }, { status: 403 });
  if (due.getTime() > parent.dueDate.getTime()) return NextResponse.json({ error: "Your date must be on or before the date above you, so there is slack" }, { status: 400 });

  const old = (await prisma.deadline.findMany({ where: { chairmanId, setById: user.id, parentId: parent.id, allCourses: true } as never, select: { id: true, dueDate: true, title: true } })) as unknown as { id: string; dueDate: Date; title: string }[];
  for (const o of old) await prisma.deadline.deleteMany({ where: { chairmanId, setById: user.id, kind: parent.kind, title: o.title, dueDate: o.dueDate } });
  await prisma.deadline.create({ data: { chairmanId, assigneeId: null, role: parent.role, setById: user.id, kind: parent.kind, title: parent.title, description: parent.description, courseId: null, dueDate: due, allCourses: true, parentId: parent.id, planTerm: parent.planTerm, planKey: parent.planKey } as never });
  await topUpStanding(chairmanId);
  await writeAuditLog({ actorUserId: user.id, action: "TARGET_PASSED_ON", entityType: "Deadline", entityId: parent.id });
  return NextResponse.json({ ok: true }, { status: 201 });
}
