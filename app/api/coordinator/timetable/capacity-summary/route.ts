import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";

// Read-only pre/post-generation health check for the Timetable Generator.
// Answers, in one glance, the questions a Coordinator has to otherwise
// discover the hard way (by running the GA and seeing a big clash count):
//   - how many offered courses/groups still can't be scheduled at all
//     because no instructor is assigned yet (same gate as
//     schedule-sections/auto-generate, computed here WITHOUT creating
//     anything)
//   - how many theory vs lab sessions/week need a slot
//   - how many of those are "clubbed" (Course Equivalence Group) classes
//   - whether there's enough room capacity (by type) for the demand
//
// Room-hour "available capacity" is necessarily an approximation: a room
// is a shared resource usable by any batch, but each batch has its own
// configured working days/hours. This uses the UNION of every one of this
// Coordinator's batches' configured windows (falling back to the same
// Mon-Fri 8am-4pm default used elsewhere) as the institution's overall
// working week, which is an upper bound — a real room may be unusable at
// some of those hours if no batch's window actually covers them. Good
// enough to flag "you don't have nearly enough room-hours" before running
// the generator; not a substitute for the GA's own exact conflict check.
export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const batches = await prisma.batch.findMany({ where: { coordinatorId: user.id }, include: { scheduleConfig: true } });
  const batchIds = batches.map((b) => b.id);

  const [courses, groups, rooms, sections] = await Promise.all([
    prisma.course.findMany({ where: { batchId: { in: batchIds }, isOffered: true }, include: { sectionAssignments: true } }),
    prisma.courseEquivalenceGroup.findMany({
      where: { members: { some: { course: { batchId: { in: batchIds }, isOffered: true } } } },
      include: { sectionAssignments: true, members: { include: { course: true } } },
    }),
    prisma.room.findMany({ where: { chairmanId: user.managedById || "" } }),
    prisma.scheduleSection.findMany({
      where: {
        OR: [
          { course: { batchId: { in: batchIds } } },
          { group: { members: { some: { course: { batchId: { in: batchIds } } } } } },
        ],
      },
    }),
  ]);

  // Courses/groups that would be silently skipped by auto-generate because
  // no instructor is assigned at all — same logic, read-only.
  const needsAdjustment: { code: string; title: string; reason: string }[] = [];
  for (const c of courses) {
    const hasAssignment = c.sectionAssignments.length > 0;
    if (!c.instructorId && !hasAssignment) needsAdjustment.push({ code: c.code, title: c.title, reason: "No instructor assigned yet" });
  }
  for (const g of groups) {
    if (g.sectionAssignments.length === 0) {
      const first = g.members[0]?.course;
      needsAdjustment.push({ code: first ? first.code : g.name, title: `${g.name} (combined)`, reason: "No instructor assigned yet" });
    }
  }

  const clubbedOfferedCount = groups.length;
  const clubbedWithSectionsCount = new Set(sections.filter((s) => s.groupId).map((s) => s.groupId)).size;

  function summarizeType(type: "LECTURE" | "LAB") {
    const typeSections = sections.filter((s) => s.roomTypeNeeded === type);
    const sessionsPerWeekTotal = typeSections.reduce((sum, s) => sum + s.sessionsPerWeek, 0);
    const requiredHoursPerWeek = typeSections.reduce((sum, s) => sum + (s.sessionsPerWeek * s.sessionDurationMinutes) / 60, 0);
    const typeRooms = rooms.filter((r) => r.type === type);
    return {
      roomCount: typeRooms.length,
      sectionsCount: typeSections.length,
      sessionsPerWeekTotal,
      requiredHoursPerWeek: Math.round(requiredHoursPerWeek * 10) / 10,
    };
  }

  // Union of working days + widest start/end across this Coordinator's
  // batches, same fallback default as timetableSlotBuilder.ts.
  let allowedDays = new Set<string>();
  let minStart = 8, maxEnd = 16;
  if (batches.length === 0) { allowedDays = new Set(["Mon", "Tue", "Wed", "Thu", "Fri"]); }
  for (const b of batches) {
    const days: string[] = b.scheduleConfig ? JSON.parse(b.scheduleConfig.workingDaysJson) : ["Mon", "Tue", "Wed", "Thu", "Fri"];
    days.forEach((d) => allowedDays.add(d));
    minStart = Math.min(minStart, b.scheduleConfig?.dailyStartHour ?? 8);
    maxEnd = Math.max(maxEnd, b.scheduleConfig?.dailyEndHour ?? 16);
  }
  const hoursPerWeek = allowedDays.size * Math.max(0, maxEnd - minStart);

  const theory = summarizeType("LECTURE");
  const lab = summarizeType("LAB");

  return NextResponse.json({
    needsAdjustment,
    clubbed: { offered: clubbedOfferedCount, withSectionsGenerated: clubbedWithSectionsCount },
    theory: { ...theory, availableHoursPerWeek: Math.round(theory.roomCount * hoursPerWeek * 10) / 10 },
    lab: { ...lab, availableHoursPerWeek: Math.round(lab.roomCount * hoursPerWeek * 10) / 10 },
    offeredCoursesCount: courses.length,
    offeredGroupsCount: groups.length,
    note: "Room-hour availability is an approximation based on the union of your batches' working-day windows; it assumes any room can be used at any of those hours.",
  });
}
