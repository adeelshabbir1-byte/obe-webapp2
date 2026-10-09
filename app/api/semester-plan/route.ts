import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { writeAuditLog } from "../../../lib/audit";
import { PLAN_TEMPLATE, topUpStanding } from "../../../lib/deadlines";

/** The Institute Head publishes the semester plan: one standing target per task, for a role, whoever holds it. */
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "CHAIRMAN") return NextResponse.json({ error: "Only the Institute Head sets the semester plan" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const term = String(b.term || "").trim().slice(0, 60);
  const start = new Date(b.startDate);
  if (!term || isNaN(start.getTime())) return NextResponse.json({ error: "Give the semester name and its start date" }, { status: 400 });
  const items = (Array.isArray(b.items) ? b.items : []) as { key: string; dueDate: string }[];
  const chosen = items.map((i) => ({ t: PLAN_TEMPLATE.find((p) => p.key === i.key), due: new Date(i.dueDate) })).filter((x) => x.t && !isNaN(x.due.getTime()));
  if (!chosen.length) return NextResponse.json({ error: "Choose at least one task with a date" }, { status: 400 });

  // Publishing again for the same semester replaces the earlier plan, including anything passed on from it.
  await prisma.deadline.deleteMany({ where: { chairmanId: user.id, planTerm: term } as never });
  for (const { t, due } of chosen) {
    await prisma.deadline.create({ data: { chairmanId: user.id, assigneeId: null, role: t!.role, setById: user.id, kind: t!.kind, title: `${t!.title} (${term})`, description: t!.why, courseId: null, dueDate: due, allCourses: true, planTerm: term } as never });
  }
  const hasStart = await prisma.academicCalendarEntry.findFirst({ where: { chairmanId: user.id, kind: "SEMESTER_START", termName: term } });
  if (!hasStart) await prisma.academicCalendarEntry.create({ data: { chairmanId: user.id, facultyId: null, kind: "SEMESTER_START", title: `${term} begins`, startDate: start, termName: term, termYear: start.getUTCFullYear(), createdById: user.id } });
  await topUpStanding(user.id);
  await writeAuditLog({ actorUserId: user.id, action: "SEMESTER_PLAN_PUBLISHED", entityType: "Deadline", entityId: term });
  return NextResponse.json({ ok: true, count: chosen.length }, { status: 201 });
}
