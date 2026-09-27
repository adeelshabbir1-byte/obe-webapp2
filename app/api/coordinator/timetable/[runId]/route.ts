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
      // A section is either tied to one standalone course, or to an
      // Equivalence Group's combined class — never both — so both are
      // fetched and whichever is present is used below.
      scheduleSection: {
        include: {
          instructor: true,
          course: { include: { batch: true } },
          group: { include: { members: { include: { course: { include: { batch: true } } } } } },
        },
      },
    },
    orderBy: [{ dayOfWeek: "asc" }, { startHour: "asc" }],
  });

  return NextResponse.json({
    run: { id: run.id, hardViolations: run.hardViolations, generations: run.generations, notes: run.notes, createdAt: run.createdAt },
    entries: entries.map((e) => {
      const s = e.scheduleSection;
      const memberBatches = s.group ? s.group.members.map((m) => m.course.batch).filter((b): b is NonNullable<typeof b> => !!b) : [];
      const courseCode = s.course ? s.course.code : s.group!.name;
      const courseTitle = s.course ? s.course.title : "(Combined / Equivalence Group)";
      const batchId = s.course ? (s.course.batch?.id || "") : (memberBatches[0]?.id || "");
      const batchLabel = s.course
        ? (s.course.batch ? `${s.course.batch.degreeProgram} — ${s.course.batch.batchName}` : "—")
        : memberBatches.map((b) => `${b.degreeProgram} — ${b.batchName}`).join("; ") || "—";
      return {
        id: e.id, day: e.dayOfWeek, startHour: e.startHour, endHour: e.endHour,
        roomName: e.room.name, roomType: e.room.type,
        courseCode, courseTitle,
        sectionLabel: s.sectionLabel,
        instructorId: s.instructorId, instructorName: s.instructor.name,
        batchId, batchLabel,
        roomId: e.roomId,
      };
    }),
  });
}
