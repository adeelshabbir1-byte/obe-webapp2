import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { writeAuditLog } from "../../../../lib/audit";

// Copies the current semester and/or holidays of one program to all the other programs of the department.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "DEPARTMENT_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  if (!body.fromCoordinatorId || (!body.term && !body.holidays)) return NextResponse.json({ error: "choose a program and what to copy" }, { status: 400 });

  const all = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", departmentId: user.departmentId, managedById: user.managedById }, select: { id: true } });
  const source = all.find((c) => c.id === body.fromCoordinatorId);
  if (!source) return NextResponse.json({ error: "program not found in your department" }, { status: 404 });
  const others = all.filter((c) => c.id !== source.id);

  let holidaysAdded = 0;
  if (body.term) {
    const term = await prisma.currentTerm.findUnique({ where: { coordinatorId: source.id } });
    if (!term) return NextResponse.json({ error: "that program has no current semester set yet" }, { status: 400 });
    for (const o of others) {
      await prisma.currentTerm.upsert({ where: { coordinatorId: o.id }, create: { coordinatorId: o.id, termName: term.termName, year: term.year }, update: { termName: term.termName, year: term.year } });
    }
  }
  if (body.holidays) {
    const holidays = await prisma.holiday.findMany({ where: { coordinatorId: source.id } });
    for (const o of others) {
      const res = await prisma.holiday.createMany({ data: holidays.map((h) => ({ coordinatorId: o.id, date: h.date, label: h.label })), skipDuplicates: true });
      holidaysAdded += res.count;
    }
  }
  await writeAuditLog({ actorUserId: user.id, action: "DEPARTMENT_CALENDAR_COPIED", entityType: "User", entityId: source.id, metadata: { term: !!body.term, holidays: !!body.holidays, programs: others.length, holidaysAdded } });
  return NextResponse.json({ ok: true, programs: others.length, holidaysAdded });
}
