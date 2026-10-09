import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { writeAuditLog } from "../../../../lib/audit";
import { academicScope } from "../../../../lib/academic";

/** Program Lead: copy the official holidays and semester dates into their own calendar. */
export async function POST() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { chairmanId, facultyId } = await academicScope(user);
  const entries = await prisma.academicCalendarEntry.findMany({ where: { chairmanId, OR: [{ facultyId: null }, ...(facultyId ? [{ facultyId }] : [])] }, orderBy: { startDate: "asc" } });
  let holidays = 0, terms = 0;
  for (const e of entries.filter((x) => x.kind === "HOLIDAY" || x.kind === "BREAK")) {
    const end = e.endDate || e.startDate;
    for (let d = new Date(e.startDate), n = 0; d <= end && n < 60; d = new Date(d.getTime() + 86400000), n++) {
      await prisma.holiday.upsert({ where: { coordinatorId_date: { coordinatorId: user.id, date: d } }, create: { coordinatorId: user.id, date: d, label: e.title }, update: { label: e.title } });
      holidays++;
    }
  }
  const programs = Array.from(new Set((await prisma.batch.findMany({ where: { coordinatorId: user.id }, select: { degreeProgram: true } })).map((b) => b.degreeProgram)));
  const byTerm = new Map<string, typeof entries>();
  for (const e of entries.filter((x) => ["SEMESTER_START", "MIDTERM", "FINAL"].includes(x.kind) && x.termName && x.termYear)) {
    const k = `${e.termName}|${e.termYear}`; byTerm.set(k, [...(byTerm.get(k) || []), e]);
  }
  for (const [k, es] of Array.from(byTerm)) {
    const [termName, y] = k.split("|"); const termYear = Number(y);
    const pick = (kind: string) => es.filter((x) => x.kind === kind).sort((a, b) => (b.facultyId ? 1 : 0) - (a.facultyId ? 1 : 0))[0]; // faculty entry wins over institute-wide
    const data: Record<string, Date | null> = {};
    const ss = pick("SEMESTER_START"), mt = pick("MIDTERM"), fn = pick("FINAL");
    if (ss) data.semesterStartDate = ss.startDate;
    if (mt) { data.midtermStartDate = mt.startDate; data.midtermEndDate = mt.endDate || mt.startDate; }
    if (fn) { data.finalStartDate = fn.startDate; data.finalEndDate = fn.endDate || fn.startDate; }
    if (!Object.keys(data).length) continue;
    for (const degreeProgram of programs) {
      await prisma.semesterDates.upsert({
        where: { coordinatorId_degreeProgram_termName_termYear: { coordinatorId: user.id, degreeProgram, termName, termYear } },
        create: { coordinatorId: user.id, degreeProgram, termName, termYear, ...data }, update: data,
      });
      terms++;
    }
  }
  await writeAuditLog({ actorUserId: user.id, action: "ACADEMIC_CALENDAR_APPLIED", entityType: "User", entityId: user.id, metadata: { holidays, terms } as never });
  return NextResponse.json({ ok: true, holidays, terms });
}
