import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/db";
import { timetableActor, READ_ONLY, type TimetableActor } from "../../../../../lib/timetableAccess";
import { coversOf, getMaxSection } from "../../../../../lib/studentSections";

// A section belongs to either a standalone course or an equivalence group — never both — and must be on this
// department timetable (any of its batches).
async function inScope(section: { courseId: string | null; groupId: string | null }, actor: TimetableActor): Promise<boolean> {
  const coordinatorIds = actor.scope.coordinatorIds.concat("none");
  if (section.courseId) return (await prisma.course.count({ where: { id: section.courseId, batch: { coordinatorId: { in: coordinatorIds } } } })) > 0;
  if (section.groupId) return (await prisma.courseEquivalenceMember.count({ where: { groupId: section.groupId, course: { batch: { coordinatorId: { in: coordinatorIds } } } } })) > 0;
  return false;
}

async function sizeOf(id: string, max: number) {
  const s = await prisma.scheduleSection.findUnique({ where: { id }, include: { course: { select: { batchId: true } }, group: { include: { members: { include: { course: { select: { batchId: true, isOffered: true } } } } } } } });
  if (!s) return 0;
  return ((await coversOf([{ id: s.id, course: s.course, group: s.group }], max)).get(s.id) || []).reduce((a, c) => a + c.size, 0);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const actor = await timetableActor();
  if (!actor) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!actor.canEdit) return NextResponse.json({ error: READ_ONLY(actor) }, { status: 403 });

  const section = await prisma.scheduleSection.findUnique({ where: { id: params.id } });
  if (!section || !(await inScope(section, actor))) return NextResponse.json({ error: "not found" }, { status: 404 });
  // Hard rule: no section holds more than the limit. One made before student sections existed may — say so.
  const max = await getMaxSection(actor.chairmanId, actor.scope.key);
  const size = await sizeOf(section.id, max);
  if (size > max) return NextResponse.json({ error: `${section.sectionLabel} holds ${size} students — over the ${max} limit. Run "Auto-generate sections" to split it into sections of at most ${max}.` }, { status: 400 });

  const body = await req.json();
  const n = (v: unknown, lo: number, hi: number, cur: number) => { const x = parseInt(String(v), 10); return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : cur; };
  const updated = await prisma.scheduleSection.update({
    where: { id: params.id },
    data: {
      sessionsPerWeek: body.sessionsPerWeek !== undefined ? n(body.sessionsPerWeek, 1, 7, section.sessionsPerWeek) : section.sessionsPerWeek,
      sessionDurationMinutes: body.sessionDurationMinutes !== undefined ? n(body.sessionDurationMinutes, 30, 480, section.sessionDurationMinutes) : section.sessionDurationMinutes,
      roomTypeNeeded: body.roomTypeNeeded === "LAB" || body.roomTypeNeeded === "LECTURE" ? body.roomTypeNeeded : section.roomTypeNeeded,
      sectionLabel: typeof body.sectionLabel === "string" && body.sectionLabel.trim() ? body.sectionLabel.trim().slice(0, 40) : section.sectionLabel,
    },
  });
  return NextResponse.json({ section: updated });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const actor = await timetableActor();
  if (!actor) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!actor.canEdit) return NextResponse.json({ error: READ_ONLY(actor) }, { status: 403 });

  const section = await prisma.scheduleSection.findUnique({ where: { id: params.id } });
  if (!section || !(await inScope(section, actor))) return NextResponse.json({ error: "not found" }, { status: 404 });

  // A section used in a generated timetable is retired instead of deleted, so that timetable keeps its entries.
  if (await prisma.timetableEntry.count({ where: { scheduleSectionId: section.id } })) {
    await (prisma as unknown as Record<string, any>).scheduleSectionRetired.upsert({ where: { scheduleSectionId: section.id }, create: { scheduleSectionId: section.id, note: "removed by hand" }, update: {} });
    return NextResponse.json({ ok: true, retired: true });
  }
  await (prisma as unknown as Record<string, any>).scheduleSectionCover.deleteMany({ where: { scheduleSectionId: section.id } }).catch(() => null);
  await prisma.scheduleSection.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
