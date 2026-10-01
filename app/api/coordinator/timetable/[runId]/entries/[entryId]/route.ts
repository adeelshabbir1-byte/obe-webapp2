import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../../lib/session";
import { prisma } from "../../../../../../../lib/db";
import { chairmanIdFor } from "../../../../../../../lib/reportScope";

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export async function PUT(req: NextRequest, { params }: { params: { runId: string; entryId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const chairmanId = await chairmanIdFor(user);

  const run = await prisma.timetableRun.findUnique({ where: { id: params.runId } });
  if (!run || run.chairmanId !== chairmanId) return NextResponse.json({ error: "not found" }, { status: 404 });

  const sectionInclude = { course: { include: { batch: true } }, group: { include: { members: { include: { course: { include: { batch: true } } } } } } };

  // Codes/batchIds for a section either come straight from its one
  // standalone course, or — for a combined Equivalence Group section —
  // from every member course, since a clash against ANY of those member
  // batches is a real conflict for that batch's own students.
  function codeFor(section: { course: { code: string } | null; group: { name: string } | null }): string {
    return section.course ? section.course.code : `${section.group!.name} (combined)`;
  }
  function batchIdsFor(section: { course: { batch: { id: string } | null } | null; group: { members: { course: { batch: { id: string } | null } }[] } | null }): string[] {
    if (section.course) return section.course.batch ? [section.course.batch.id] : [];
    return (section.group?.members || []).map((m) => m.course.batch?.id).filter((id): id is string => !!id);
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
  const entryBatchIds = batchIdsFor(entry.scheduleSection);
  const clashingEntryIds: string[] = [];
  const reasons: string[] = [];
  for (const other of allEntries) {
    if (!overlaps(newStartHour, newEndHour, other.startHour, other.endHour)) continue;
    const otherCode = codeFor(other.scheduleSection);
    if (other.roomId === effectiveRoomId) { clashingEntryIds.push(other.id); reasons.push(`Room clash with ${otherCode}`); }
    if (other.scheduleSection.instructorId === entry.scheduleSection.instructorId) { clashingEntryIds.push(other.id); reasons.push(`Instructor clash with ${otherCode}`); }
    if (batchIdsFor(other.scheduleSection).some((id) => entryBatchIds.includes(id))) { clashingEntryIds.push(other.id); reasons.push(`Batch clash with ${otherCode}`); }
  }

  return NextResponse.json({
    ok: true, newStartHour, newEndHour,
    clashes: clashingEntryIds.length > 0 ? { entryIds: Array.from(new Set(clashingEntryIds)), reasons } : null,
  });
}
