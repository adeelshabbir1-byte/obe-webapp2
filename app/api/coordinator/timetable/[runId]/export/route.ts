import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { chairmanIdFor } from "../../../../../../lib/reportScope";
import { buildExcelResponse } from "../../../../../../lib/excelExport";

const DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export async function GET(req: Request, { params }: { params: { runId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const chairmanId = await chairmanIdFor(user);

  const run = await prisma.timetableRun.findUnique({ where: { id: params.runId } });
  if (!run || run.chairmanId !== chairmanId) return NextResponse.json({ error: "not found" }, { status: 404 });

  const entries = await prisma.timetableEntry.findMany({
    where: { timetableRunId: params.runId },
    include: {
      room: true,
      scheduleSection: {
        include: {
          instructor: true,
          course: { include: { batch: true } },
          group: { include: { members: { include: { course: { include: { batch: true } } } } } },
        },
      },
    },
  });
  entries.sort((a, b) => DAY_ORDER.indexOf(a.dayOfWeek) - DAY_ORDER.indexOf(b.dayOfWeek) || a.startHour - b.startHour);

  const fmt = (h: number) => { const hh = Math.floor(h), mm = Math.round((h - hh) * 60); return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`; };

  const allRows = entries.map((e) => {
    const s = e.scheduleSection;
    const memberBatches = s.group ? s.group.members.map((m) => m.course.batch).filter((b): b is NonNullable<typeof b> => !!b) : [];
    const courseLabel = s.course ? `${s.course.code} — ${s.course.title}` : `${s.group!.name} (Combined / Equivalence Group)`;
    const batchLabel = s.course
      ? (s.course.batch ? `${s.course.batch.degreeProgram} — ${s.course.batch.batchName}` : "—")
      : memberBatches.map((b) => `${b.degreeProgram} — ${b.batchName}`).join("; ") || "—";
    return {
      day: e.dayOfWeek, time: `${fmt(e.startHour)}–${fmt(e.endHour)}`,
      course: courseLabel,
      section: s.sectionLabel, instructor: s.instructor.name,
      batch: batchLabel,
      room: `${e.room.name} (${e.room.type})`,
    };
  });

  const columns = [
    { header: "Day", key: "day", width: 10 },
    { header: "Time", key: "time", width: 14 },
    { header: "Course", key: "course", width: 34 },
    { header: "Section", key: "section", width: 14 },
    { header: "Instructor", key: "instructor", width: 22 },
    { header: "Batch / Degree Program", key: "batch", width: 30 },
    { header: "Room", key: "room", width: 18 },
  ];

  const sheets = [{ name: "Full Timetable", columns, rows: allRows }];

  // One sheet per batch too, for a ready-to-print per-program view. A
  // combined-group row's "batch" is a "A; B" joined label already, so it
  // gets its own sheet as that combined label rather than splitting apart.
  const batches = Array.from(new Set(allRows.map((r) => r.batch)));
  for (const b of batches) {
    sheets.push({ name: b.slice(0, 31), columns, rows: allRows.filter((r) => r.batch === b) });
  }

  return buildExcelResponse(`Timetable-${params.runId.slice(0, 8)}.xlsx`, sheets);
}
