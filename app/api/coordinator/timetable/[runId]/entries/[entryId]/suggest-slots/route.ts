import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../../../lib/session";
import { JUMMAH_BREAK } from "../../../../../../../../lib/timetableSlotBuilder";
import { prisma } from "../../../../../../../../lib/db";
import { chairmanIdFor } from "../../../../../../../../lib/reportScope";

const DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const STEP = 0.5; // half-hour granularity, matching TimetableEntry.startHour
const MAX_SUGGESTIONS = 20;

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

const sectionInclude = { course: { include: { batch: true } }, group: { include: { members: { include: { course: { include: { batch: true } } } } } } };
function batchIdsFor(section: { course: { batch: { id: string } | null } | null; group: { members: { course: { batch: { id: string } | null } }[] } | null }): string[] {
  if (section.course) return section.course.batch ? [section.course.batch.id] : [];
  return (section.group?.members || []).map((m) => m.course.batch?.id).filter((id): id is string => !!id);
}

// For an existing class that needs to move, finds candidate (day, time,
// room) combinations where the instructor, every affected batch, AND some
// room of the right type are all simultaneously free — so a reschedule can
// be picked straight from a pre-checked list instead of trial-and-error
// dragging. Read-only: nothing is moved until the Coordinator picks one via
// the existing PUT .../entries/[entryId] endpoint (room choice is applied
// separately there — this just names which room(s) work for that slot).
export async function GET(req: Request, { params }: { params: { runId: string; entryId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const chairmanId = await chairmanIdFor(user);

  const run = await prisma.timetableRun.findUnique({ where: { id: params.runId } });
  if (!run || run.chairmanId !== chairmanId) return NextResponse.json({ error: "not found" }, { status: 404 });

  const entry = await prisma.timetableEntry.findUnique({
    where: { id: params.entryId },
    include: { scheduleSection: { include: sectionInclude } },
  });
  if (!entry || entry.timetableRunId !== params.runId) return NextResponse.json({ error: "not found" }, { status: 404 });

  const duration = entry.endHour - entry.startHour;
  const batchIds = batchIdsFor(entry.scheduleSection);
  const instructorId = entry.scheduleSection.instructorId;

  const [otherEntries, unavailability, batchConfigs, candidateRooms] = await Promise.all([
    prisma.timetableEntry.findMany({ where: { timetableRunId: params.runId, id: { not: entry.id } }, include: { scheduleSection: { include: sectionInclude } } }),
    prisma.facultyUnavailability.findMany({ where: { facultyId: instructorId } }),
    prisma.batchScheduleConfig.findMany({ where: { batchId: { in: batchIds } } }),
    prisma.room.findMany({ where: { chairmanId, type: entry.scheduleSection.roomTypeNeeded } }),
  ]);

  // Allowed days/hours = the INTERSECTION across every batch this class
  // affects (a combined-group section serves more than one batch at once,
  // so a slot only works if it's within every one of their windows).
  let allowedDays = new Set(DAY_ORDER);
  let dayStart = 0, dayEnd = 24;
  if (batchConfigs.length > 0) {
    allowedDays = new Set(JSON.parse(batchConfigs[0].workingDaysJson) as string[]);
    dayStart = batchConfigs[0].dailyStartHour; dayEnd = batchConfigs[0].dailyEndHour;
    for (const bc of batchConfigs.slice(1)) {
      const days = new Set(JSON.parse(bc.workingDaysJson) as string[]);
      allowedDays = new Set([...allowedDays].filter((d) => days.has(d)));
      dayStart = Math.max(dayStart, bc.dailyStartHour); dayEnd = Math.min(dayEnd, bc.dailyEndHour);
    }
  }

  const candidates: { dayOfWeek: string; startHour: number; endHour: number; roomIds: string[]; roomNames: string[] }[] = [];

  for (const day of DAY_ORDER.filter((d) => allowedDays.has(d))) {
    const sameDayOthers = otherEntries.filter((o) => o.dayOfWeek === day);
    const sameDayUnavail = unavailability.filter((u) => u.dayOfWeek === day);

    for (let start = dayStart; start + duration <= dayEnd; start += STEP) {
      const end = start + duration;

      const instructorBusy = sameDayOthers.some((o) => o.scheduleSection.instructorId === instructorId && overlaps(start, end, o.startHour, o.endHour));
      if (instructorBusy) continue;
      const instructorUnavailable = sameDayUnavail.some((u) => overlaps(start, end, u.startHour, u.endHour));
      if (instructorUnavailable) continue;
      if (day === JUMMAH_BREAK.day && overlaps(start, end, JUMMAH_BREAK.startHour, JUMMAH_BREAK.endHour)) continue; // Jummah break
      const batchBusy = sameDayOthers.some((o) => overlaps(start, end, o.startHour, o.endHour) && batchIdsFor(o.scheduleSection).some((id) => batchIds.includes(id)));
      if (batchBusy) continue;

      const freeRooms = candidateRooms.filter((r) => !sameDayOthers.some((o) => o.roomId === r.id && overlaps(start, end, o.startHour, o.endHour)));
      if (freeRooms.length === 0) continue;

      candidates.push({ dayOfWeek: day, startHour: start, endHour: end, roomIds: freeRooms.map((r) => r.id), roomNames: freeRooms.map((r) => r.name) });
      if (candidates.length >= MAX_SUGGESTIONS) break;
    }
    if (candidates.length >= MAX_SUGGESTIONS) break;
  }

  return NextResponse.json({ duration, candidates });
}
