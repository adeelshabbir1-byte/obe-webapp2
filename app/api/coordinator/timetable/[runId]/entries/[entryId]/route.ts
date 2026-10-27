import { NextRequest, NextResponse } from "next/server";
import { timetableActor, READ_ONLY } from "../../../../../../../lib/timetableAccess";
import { sectionKeysById } from "../../../../../../../lib/studentSections";
import { prisma } from "../../../../../../../lib/db";
import { chairmanIdFor } from "../../../../../../../lib/reportScope";
import { busyElsewhere } from "../../../../../../../lib/timetableScope";

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export async function PUT(req: NextRequest, { params }: { params: { runId: string; entryId: string } }) {
  const actor = await timetableActor();
  if (!actor) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!actor.canEdit) return NextResponse.json({ error: READ_ONLY(actor) }, { status: 403 });
  const user = actor.user;
  const chairmanId = await chairmanIdFor(user);

  const run = await prisma.timetableRun.findUnique({ where: { id: params.runId } });
  if (!run || run.chairmanId !== chairmanId) return NextResponse.json({ error: "not found" }, { status: 404 });

  const sectionInclude = { course: { include: { batch: true } }, group: { include: { members: { include: { course: { include: { batch: true } } } } } } };

  // Codes/batchIds for a section either come straight from its one
  // standalone course, or — for a combined Equivalence Group section —
  // from every member course, since a clash against ANY of those member
  // batches is a real conflict for that batch's own students.
  function codeFor(section: { course: { code: string; title: string } | null; group: { name: string } | null }): string {
    return section.course ? `${section.course.code} — ${section.course.title}` : `${section.group!.name} (combined)`;
  }


  const entry = await prisma.timetableEntry.findUnique({
    where: { id: params.entryId },
    include: { scheduleSection: { include: sectionInclude } },
  });
  if (!entry || entry.timetableRunId !== params.runId) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json();
  const newDay: string = body.day;
  const newStartHour: number = parseFloat(body.startHour);
  // Optional — lets the "suggest available slots" picker apply a room
  // change in the same move when the current room isn't free at the new
  // time. A plain drag-move (no roomId in the body) keeps the same room.
  const newRoomId: string | null = typeof body.roomId === "string" && body.roomId ? body.roomId : null;
  if (!newDay || isNaN(newStartHour)) return NextResponse.json({ error: "day and startHour are required" }, { status: 400 });

  const duration = entry.endHour - entry.startHour;
  const newEndHour = newStartHour + duration;

  await prisma.timetableEntry.update({
    where: { id: entry.id },
    data: { dayOfWeek: newDay, startHour: newStartHour, endHour: newEndHour, ...(newRoomId ? { roomId: newRoomId } : {}) },
  });

  // Check what this move now clashes with — same room, same instructor,
  // or same batch, overlapping in time, on the same day.
  const allEntries = await prisma.timetableEntry.findMany({
    where: { timetableRunId: params.runId, id: { not: entry.id }, dayOfWeek: newDay },
    include: { scheduleSection: { include: sectionInclude } },
  });

  const effectiveRoomId = newRoomId || entry.roomId;
  // Clashes are per student section ("batchId#A"): Section A and Section B of one batch may run at the same time.
  const keyMap = await sectionKeysById([entry.scheduleSectionId, ...allEntries.map((o) => o.scheduleSectionId)]);
  const entryKeys = keyMap.get(entry.scheduleSectionId) || [];
  const clashingEntryIds: string[] = [];
  const reasons: string[] = [];
  const entryTeacher = await prisma.user.findUnique({ where: { id: entry.scheduleSection.instructorId }, select: { isVisitingPlaceholder: true } });
  for (const other of allEntries) {
    if (!overlaps(newStartHour, newEndHour, other.startHour, other.endHour)) continue;
    const otherCode = codeFor(other.scheduleSection);
    if (other.roomId === effectiveRoomId) { clashingEntryIds.push(other.id); reasons.push(`Room clash with ${otherCode}`); }
    if (!entryTeacher?.isVisitingPlaceholder && other.scheduleSection.instructorId === entry.scheduleSection.instructorId) { clashingEntryIds.push(other.id); reasons.push(`Instructor clash with ${otherCode}`); }
    if ((keyMap.get(other.scheduleSectionId) || []).some((k) => entryKeys.includes(k))) { clashingEntryIds.push(other.id); reasons.push(`Student clash with ${otherCode} (same students)`); }
  }

  // The same teacher may already be teaching in another department's own timetable at that time.
  if (!entryTeacher?.isVisitingPlaceholder) {
    const elsewhere = await busyElsewhere(chairmanId, run.scopeKey || "SHARED", [entry.scheduleSection.instructorId]);
    if (elsewhere.some((b) => b.dayOfWeek === newDay && overlaps(newStartHour, newEndHour, b.startHour, b.endHour))) {
      reasons.push("Teacher is already teaching at this time in another department's timetable");
    }
  }

  return NextResponse.json({
    ok: true, newStartHour, newEndHour,
    clashes: clashingEntryIds.length > 0 ? { entryIds: Array.from(new Set(clashingEntryIds)), reasons } : null,
  });
}
