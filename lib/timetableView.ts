import { prisma } from "./db";

export const DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export type TimetableEntryView = {
  id: string; dayOfWeek: string; startHour: number; endHour: number;
  courseCode: string; courseTitle: string; sectionLabel: string;
  instructorId: string; instructorName: string;
  roomId: string; roomName: string; roomType: string;
  batchIds: string[]; batchLabels: string[]; degreePrograms: string[];
};

const sectionInclude = {
  course: { include: { batch: true } },
  group: { include: { members: { include: { course: { include: { batch: true } } } } } },
  instructor: true,
} as const;

type SectionWithIncludes = {
  sectionLabel: string; instructorId: string; instructor: { name: string } | null;
  course: { code: string; title: string; batch: { id: string; degreeProgram: string; batchName: string } | null } | null;
  group: { name: string; members: { course: { code: string; title: string; batch: { id: string; degreeProgram: string; batchName: string } | null } }[] } | null;
};

function codeTitleFor(section: SectionWithIncludes): { code: string; title: string } {
  if (section.course) return { code: section.course.code, title: section.course.title };
  const first = section.group?.members?.[0]?.course;
  return { code: first ? first.code : "—", title: section.group ? `${section.group.name} (combined)` : "—" };
}

function batchesFor(section: SectionWithIncludes): { id: string; label: string; degreeProgram: string }[] {
  if (section.course) {
    return section.course.batch ? [{ id: section.course.batch.id, label: `${section.course.batch.degreeProgram} — ${section.course.batch.batchName}`, degreeProgram: section.course.batch.degreeProgram }] : [];
  }
  const seen = new Map<string, { id: string; label: string; degreeProgram: string }>();
  for (const m of section.group?.members || []) {
    const b = m.course.batch;
    if (b && !seen.has(b.id)) seen.set(b.id, { id: b.id, label: `${b.degreeProgram} — ${b.batchName}`, degreeProgram: b.degreeProgram });
  }
  return Array.from(seen.values());
}

/** The most recently generated run for this chairman — there's no separate
 * "published/live" concept (see TimetableRun.status, which is just the GA's
 * own RUNNING/COMPLETED/STOPPED/FAILED lifecycle), so "latest by createdAt"
 * is the one convention every viewer (Coordinator's own edit screen
 * included) uses for "the current timetable". */
export async function latestRunFor(chairmanId: string) {
  return prisma.timetableRun.findFirst({ where: { chairmanId }, orderBy: { createdAt: "desc" } });
}

/** Every entry in a chairman's latest (or a specific) timetable run, fully
 * resolved to course/instructor/room/batch labels — the one place this
 * shape is built, shared by every role's read-only view plus the
 * reschedule slot-finder. */
export async function getTimetableEntries(chairmanId: string, runId?: string): Promise<TimetableEntryView[]> {
  const run = runId ? await prisma.timetableRun.findFirst({ where: { id: runId, chairmanId } }) : await latestRunFor(chairmanId);
  if (!run) return [];

  const entries = await prisma.timetableEntry.findMany({
    where: { timetableRunId: run.id },
    include: { room: true, scheduleSection: { include: sectionInclude } },
  });

  return entries
    .map((e) => {
      const section = e.scheduleSection as unknown as SectionWithIncludes;
      const { code, title } = codeTitleFor(section);
      const batches = batchesFor(section);
      return {
        id: e.id, dayOfWeek: e.dayOfWeek, startHour: e.startHour, endHour: e.endHour,
        courseCode: code, courseTitle: title, sectionLabel: section.sectionLabel,
        instructorId: section.instructorId, instructorName: section.instructor?.name || "—",
        roomId: e.roomId, roomName: e.room?.name || "—", roomType: e.room?.type || "—",
        batchIds: batches.map((b) => b.id), batchLabels: batches.map((b) => b.label),
        degreePrograms: Array.from(new Set(batches.map((b) => b.degreeProgram))),
      };
    })
    .sort((a, b) => (DAY_ORDER.indexOf(a.dayOfWeek) - DAY_ORDER.indexOf(b.dayOfWeek)) || (a.startHour - b.startHour));
}

function hourLabel(h: number): string {
  const hour = Math.floor(h);
  const minutes = Math.round((h - hour) * 60);
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${minutes.toString().padStart(2, "0")} ${period}`;
}
export function timeRangeLabel(startHour: number, endHour: number): string {
  return `${hourLabel(startHour)} – ${hourLabel(endHour)}`;
}
