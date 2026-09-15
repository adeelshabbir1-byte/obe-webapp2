import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";

// Creates one ScheduleSection per (course, instructor) pair that doesn't
// already have one — the course's own instructor, plus anyone from
// CourseSectionAssignment. Safe to re-run: never duplicates existing rows.
export async function POST() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const batches = await prisma.batch.findMany({ where: { coordinatorId: user.id } });
  const courses = await prisma.course.findMany({
    where: { batchId: { in: batches.map((b) => b.id) }, isOffered: true },
    include: { sectionAssignments: true },
  });

  const existing = await prisma.scheduleSection.findMany({ where: { courseId: { in: courses.map((c) => c.id) } } });
  const existingPairs = new Set(existing.map((s) => `${s.courseId}::${s.instructorId}`));

  let created = 0;
  for (const c of courses) {
    const instructorIds = new Set<string>();
    if (c.instructorId) instructorIds.add(c.instructorId);
    for (const a of c.sectionAssignments) instructorIds.add(a.instructorId);

    let labelIndex = 0;
    for (const instructorId of instructorIds) {
      const key = `${c.id}::${instructorId}`;
      if (existingPairs.has(key)) continue;
      labelIndex++;
      // Default room type: LAB if the course itself has a lab component,
      // otherwise LECTURE — PC can override per section afterward.
      // Defaults: theory = 1.5hr x 2 sessions/week, lab = 3hr x 1 session/week.
      // roomTypeNeeded must reflect whether THIS course record is itself a
      // Lab course (courseType === "Lab", set by "Split into Lab") — not
      // hasLab, which only means the course HAS a lab component and would
      // otherwise mark a theory course's own sessions as needing a lab room.
      const roomTypeNeeded = c.courseType === "Lab" ? "LAB" : "LECTURE";
      await prisma.scheduleSection.create({
        data: {
          courseId: c.id, instructorId, sectionLabel: `Section ${String.fromCharCode(64 + labelIndex)}`,
          roomTypeNeeded,
          sessionsPerWeek: roomTypeNeeded === "LAB" ? 1 : 2,
          sessionDurationMinutes: roomTypeNeeded === "LAB" ? 180 : 90,
        },
      });
      created++;
    }
  }

  return NextResponse.json({ created });
}
