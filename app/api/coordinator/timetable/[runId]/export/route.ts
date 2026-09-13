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
    include: { room: true, scheduleSection: { include: { instructor: true, course: { include: { batch: true } } } } },
  });
  entries.sort((a, b) => DAY_ORDER.indexOf(a.dayOfWeek) - DAY_ORDER.indexOf(b.dayOfWeek) || a.startHour - b.startHour);

  const fmt = (h: number) => { const hh = Math.floor(h), mm = Math.round((h - hh) * 60); return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`; };

  const allRows = entries.map((e) => ({
    day: e.dayOfWeek, time: `${fmt(e.startHour)}–${fmt(e.endHour)}`,
    course: `${e.scheduleSection.course.code} — ${e.scheduleSection.course.title}`,
    section: e.scheduleSection.sectionLabel, instructor: e.scheduleSection.instructor.name,
    batch: e.scheduleSection.course.batch ? `${e.scheduleSection.course.batch.degreeProgram} — ${e.scheduleSection.course.batch.batchName}` : "—",
    room: `${e.room.name} (${e.room.type})`,
  }));

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

  // One sheet per batch too, for a ready-to-print per-program view.
  const batches = Array.from(new Set(entries.map((e) => e.scheduleSection.course.batch ? `${e.scheduleSection.course.batch.degreeProgram} — ${e.scheduleSection.course.batch.batchName}` : "Unknown")));
  for (const b of batches) {
    sheets.push({ name: b.slice(0, 31), columns, rows: allRows.filter((r) => r.batch === b) });
  }

  return buildExcelResponse(`Timetable-${params.runId.slice(0, 8)}.xlsx`, sheets);
}
