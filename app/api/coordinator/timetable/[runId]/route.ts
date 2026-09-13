import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { chairmanIdFor } from "../../../../../lib/reportScope";

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
      scheduleSection: { include: { instructor: true, course: { include: { batch: true } } } },
    },
    orderBy: [{ dayOfWeek: "asc" }, { startHour: "asc" }],
  });

  return NextResponse.json({
    run: { id: run.id, hardViolations: run.hardViolations, generations: run.generations, notes: run.notes, createdAt: run.createdAt },
    entries: entries.map((e) => ({
      id: e.id, day: e.dayOfWeek, startHour: e.startHour, endHour: e.endHour,
      roomName: e.room.name, roomType: e.room.type,
      courseCode: e.scheduleSection.course.code, courseTitle: e.scheduleSection.course.title,
      sectionLabel: e.scheduleSection.sectionLabel,
      instructorId: e.scheduleSection.instructorId, instructorName: e.scheduleSection.instructor.name,
      batchId: e.scheduleSection.course.batch?.id || "", batchLabel: e.scheduleSection.course.batch ? `${e.scheduleSection.course.batch.degreeProgram} — ${e.scheduleSection.course.batch.batchName}` : "—",
      roomId: e.roomId,
    })),
  });
}
