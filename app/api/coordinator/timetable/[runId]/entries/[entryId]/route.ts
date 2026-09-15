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

  const entry = await prisma.timetableEntry.findUnique({
    where: { id: params.entryId },
    include: { scheduleSection: { include: { course: { include: { batch: true } } } } },
  });
  if (!entry || entry.timetableRunId !== params.runId) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json();
  const newDay: string = body.day;
  const newStartHour: number = parseFloat(body.startHour);
  if (!newDay || isNaN(newStartHour)) return NextResponse.json({ error: "day and startHour are required" }, { status: 400 });

  const duration = entry.endHour - entry.startHour;
  const newEndHour = newStartHour + duration;

  await prisma.timetableEntry.update({ where: { id: entry.id }, data: { dayOfWeek: newDay, startHour: newStartHour, endHour: newEndHour } });

  // Check what this move now clashes with — same room, same instructor,
  // or same batch, overlapping in time, on the same day.
  const allEntries = await prisma.timetableEntry.findMany({
    where: { timetableRunId: params.runId, id: { not: entry.id }, dayOfWeek: newDay },
    include: { scheduleSection: { include: { course: { include: { batch: true } } } } },
  });

  const clashingEntryIds: string[] = [];
  const reasons: string[] = [];
  for (const other of allEntries) {
    if (!overlaps(newStartHour, newEndHour, other.startHour, other.endHour)) continue;
    if (other.roomId === entry.roomId) { clashingEntryIds.push(other.id); reasons.push(`Room clash with ${other.scheduleSection.course.code}`); }
    if (other.scheduleSection.instructorId === entry.scheduleSection.instructorId) { clashingEntryIds.push(other.id); reasons.push(`Instructor clash with ${other.scheduleSection.course.code}`); }
    if (other.scheduleSection.course.batchId && other.scheduleSection.course.batchId === entry.scheduleSection.course.batchId) { clashingEntryIds.push(other.id); reasons.push(`Batch clash with ${other.scheduleSection.course.code}`); }
  }

  return NextResponse.json({
    ok: true, newStartHour, newEndHour,
    clashes: clashingEntryIds.length > 0 ? { entryIds: Array.from(new Set(clashingEntryIds)), reasons } : null,
  });
}
