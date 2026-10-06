import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";

// Creates ScheduleSection rows for every offered course AND every Course
// Equivalence Group whose members include one of this Coordinator's
// offered courses. Previously this only ever looked at individual courses
// — a group's own combined section/instructor assignment (set on the
// Section Assignment Matrix) was silently never turned into a real
// timetable slot at all. It also used to create exactly one ScheduleSection
// per instructor regardless of how many sections they were assigned —
// sectionCount=2 produced one weekly time slot, not two — so a "2 section"
// assignment never actually became two separate classes needing two
// separate timetable slots. Both are fixed here: one ScheduleSection per
// section (not per instructor), sequentially labeled Section A, B, C...
// across every instructor assigned to that course/group.
//
// Safe to re-run: never duplicates a (course-or-group, instructor,
// section-ordinal) combination that already exists. If an assignment's
// sectionCount is reduced after sections were already generated, the
// surplus sections are left as-is (removable by hand via the existing
// per-section delete) rather than auto-deleted, since a section may
// already have real timetable entries tied to it.
export async function POST() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const batches = await prisma.batch.findMany({ where: { coordinatorId: user.id } });
  const batchIds = batches.map((b) => b.id);

  const courses = await prisma.course.findMany({
    where: { batchId: { in: batchIds }, isOffered: true },
    include: { sectionAssignments: true },
  });

  const groups = await prisma.courseEquivalenceGroup.findMany({
    where: { members: { some: { course: { batchId: { in: batchIds }, isOffered: true } } } },
    include: { sectionAssignments: true, members: { include: { course: true } } },
  });

  let created = 0;
  // Offered courses/groups that have NO instructor assigned at all (no
  // direct instructorId, no CourseSectionAssignment rows) never get a
  // ScheduleSection and therefore can never appear anywhere in the
  // generated timetable — not even as "unassigned". Reported back so the
  // coordinator can see which courses to go assign an instructor to,
  // instead of a course silently vanishing from the grid.
  const skippedNoInstructor: { code: string; title: string }[] = [];

  for (const c of courses) {
    // Every distinct instructor assigned to this course, each contributing
    // however many sections they were given (CourseSectionAssignment), plus
    // the course's own direct instructorId as one section if it isn't
    // already covered by an explicit assignment row.
    const unitInstructorIds: string[] = [];
    const assignedIds = new Set(c.sectionAssignments.map((a) => a.instructorId));
    if (c.instructorId && !assignedIds.has(c.instructorId)) unitInstructorIds.push(c.instructorId);
    for (const a of c.sectionAssignments) {
      for (let i = 0; i < Math.max(1, a.sectionCount); i++) unitInstructorIds.push(a.instructorId);
    }
    if (unitInstructorIds.length === 0) { skippedNoInstructor.push({ code: c.code, title: c.title }); continue; }

    const existing = await prisma.scheduleSection.findMany({ where: { courseId: c.id } });
    const existingCountByInstructor = new Map<string, number>();
    for (const e of existing) existingCountByInstructor.set(e.instructorId, (existingCountByInstructor.get(e.instructorId) || 0) + 1);

    const roomTypeNeeded = c.courseType === "Lab" ? "LAB" : "LECTURE";
    // A non-credit deficiency course (e.g. Maths-I, 3 h/week, 0 credits) is
    // scheduled from its own weekly contact hours: 3 h -> 2 x 90 min.
    const nonCreditHours = c.isNonCredit && c.contactHours ? c.contactHours : 0;
    const sessionsPerWeek = nonCreditHours ? (nonCreditHours <= 1 ? 1 : 2) : roomTypeNeeded === "LAB" ? 1 : 2;
    const sessionDurationMinutes = nonCreditHours ? Math.round((nonCreditHours * 60) / sessionsPerWeek) : roomTypeNeeded === "LAB" ? 180 : 90;
    let labelIndex = existing.length;
    // Only create the shortfall per instructor — if 2 units are wanted for
    // an instructor and 1 already exists, create just 1 more.
    const wantedCountByInstructor = new Map<string, number>();
    for (const id of unitInstructorIds) wantedCountByInstructor.set(id, (wantedCountByInstructor.get(id) || 0) + 1);

    for (const [instructorId, wanted] of wantedCountByInstructor) {
      const have = existingCountByInstructor.get(instructorId) || 0;
      for (let i = have; i < wanted; i++) {
        labelIndex++;
        await prisma.scheduleSection.create({
          data: {
            courseId: c.id, instructorId, sectionLabel: `Section ${String.fromCharCode(64 + labelIndex)}`,
            roomTypeNeeded,
            sessionsPerWeek,
            sessionDurationMinutes,
          },
        });
        created++;
      }
    }
  }

  for (const g of groups) {
    const unitInstructorIds: string[] = [];
    for (const a of g.sectionAssignments) {
      for (let i = 0; i < Math.max(1, a.sectionCount); i++) unitInstructorIds.push(a.instructorId);
    }
    if (unitInstructorIds.length === 0) {
      const first = g.members[0]?.course;
      skippedNoInstructor.push({ code: first ? first.code : g.name, title: `${g.name} (combined)` });
      continue;
    }

    const existing = await prisma.scheduleSection.findMany({ where: { groupId: g.id } });
    const existingCountByInstructor = new Map<string, number>();
    for (const e of existing) existingCountByInstructor.set(e.instructorId, (existingCountByInstructor.get(e.instructorId) || 0) + 1);

    let labelIndex = existing.length;
    const wantedCountByInstructor = new Map<string, number>();
    for (const id of unitInstructorIds) wantedCountByInstructor.set(id, (wantedCountByInstructor.get(id) || 0) + 1);

    for (const [instructorId, wanted] of wantedCountByInstructor) {
      const have = existingCountByInstructor.get(instructorId) || 0;
      for (let i = have; i < wanted; i++) {
        labelIndex++;
        await prisma.scheduleSection.create({
          data: {
            groupId: g.id, instructorId, sectionLabel: `Section ${String.fromCharCode(64 + labelIndex)}`,
            roomTypeNeeded: "LECTURE",
            sessionsPerWeek: 2,
            sessionDurationMinutes: 90,
          },
        });
        created++;
      }
    }
  }

  return NextResponse.json({ created, skippedNoInstructor });
}
