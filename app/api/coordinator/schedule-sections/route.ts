import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const batches = await prisma.batch.findMany({ where: { coordinatorId: user.id } });
  const batchIds = batches.map((b) => b.id);

  const [courseSections, groupSections] = await Promise.all([
    prisma.scheduleSection.findMany({
      where: { course: { batchId: { in: batchIds }, isOffered: true } }, // only what is offered now — old semesters' leftover sections stay hidden and unscheduled
      include: { course: { include: { batch: true } }, instructor: true },
      orderBy: [{ course: { code: "asc" } }],
    }),
    // A group's section belongs here if ANY of its member courses is one
    // of this Coordinator's own — same scoping the timetable generator
    // itself uses.
    prisma.scheduleSection.findMany({
      where: { group: { members: { some: { course: { batchId: { in: batchIds }, isOffered: true } } } } },
      include: { group: { include: { members: { include: { course: { include: { batch: true } } } } } }, instructor: true },
    }),
  ]);

  const sections = [
    ...courseSections.map((s) => ({
      id: s.id, courseId: s.courseId, courseCode: s.course!.code, courseTitle: s.course!.title,
      batchLabel: s.course!.batch ? `${s.course!.batch.degreeProgram} — ${s.course!.batch.batchName}` : "—",
      instructorId: s.instructorId, instructorName: s.instructor.name, sectionLabel: s.sectionLabel,
      sessionsPerWeek: s.sessionsPerWeek, sessionDurationMinutes: s.sessionDurationMinutes, roomTypeNeeded: s.roomTypeNeeded,
    })),
    ...groupSections.map((s) => ({
      id: s.id, courseId: null as string | null, courseCode: s.group!.name, courseTitle: "(Combined / Equivalence Group)",
      batchLabel: s.group!.members.map((m) => m.course.batch ? `${m.course.batch.degreeProgram} — ${m.course.batch.batchName}` : "—").join("; "),
      instructorId: s.instructorId, instructorName: s.instructor.name, sectionLabel: s.sectionLabel,
      sessionsPerWeek: s.sessionsPerWeek, sessionDurationMinutes: s.sessionDurationMinutes, roomTypeNeeded: s.roomTypeNeeded,
    })),
  ].sort((a, b) => a.courseCode.localeCompare(b.courseCode));

  return NextResponse.json({ sections });
}
