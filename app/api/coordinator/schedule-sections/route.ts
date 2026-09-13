import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const batches = await prisma.batch.findMany({ where: { coordinatorId: user.id } });
  const sections = await prisma.scheduleSection.findMany({
    where: { course: { batchId: { in: batches.map((b) => b.id) } } },
    include: { course: { include: { batch: true } }, instructor: true },
    orderBy: [{ course: { code: "asc" } }],
  });
  return NextResponse.json({
    sections: sections.map((s) => ({
      id: s.id, courseId: s.courseId, courseCode: s.course.code, courseTitle: s.course.title,
      batchLabel: s.course.batch ? `${s.course.batch.degreeProgram} — ${s.course.batch.batchName}` : "—",
      instructorId: s.instructorId, instructorName: s.instructor.name, sectionLabel: s.sectionLabel,
      sessionsPerWeek: s.sessionsPerWeek, sessionDurationMinutes: s.sessionDurationMinutes, roomTypeNeeded: s.roomTypeNeeded,
    })),
  });
}
