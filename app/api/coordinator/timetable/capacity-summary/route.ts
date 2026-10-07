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
          // Only courses offered now: sections left over from a batch's earlier semesters must not be counted.
          { course: { batchId: { in: batchIds }, isOffered: true } },
          { group: { members: { some: { course: { batchId: { in: batchIds }, isOffered: true } } } } },
        ],
      },
      include: {
        course: { select: { batchId: true, code: true, title: true, semesterNumber: true } },
        group: { include: { members: { select: { course: { select: { batchId: true, isOffered: true, code: true, title: true, semesterNumber: true } } } } } },
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

  // Contact-hours-by-program-and-term matrix: rows are degree programs,
  // columns are terms (each batch's own batchName, e.g. "Fall 2025"),
  // cells are that batch's own theory/lab hours needed this semester. A
  // combined/clubbed section's hours count toward EVERY member batch that
  // belongs to this Coordinator — each of those batches genuinely needs
  // that many hours on ITS OWN timetable, same attribution the GA itself
  // uses (see timetableSlotBuilder.ts).
  const hoursByBatch = new Map<string, { theory: number; lab: number }>();
  // Exactly which sections make up each batch's hours, so a surprising total can be traced to its cause.
  const detailsByBatch = new Map<string, { code: string; title: string; semester: number | null; section: string; type: string; hours: number; combined: boolean }[]>();
  function addHours(batchId: string, type: string, hours: number, detail: { code: string; title: string; semester: number | null; section: string; combined: boolean }) {
    const cur = hoursByBatch.get(batchId) || { theory: 0, lab: 0 };
    if (type === "LAB") cur.lab += hours; else cur.theory += hours;
    hoursByBatch.set(batchId, cur);
    const list = detailsByBatch.get(batchId) || [];
    list.push({ ...detail, type, hours });
    detailsByBatch.set(batchId, list);
  }
  for (const s of sections) {
    const hours = (s.sessionsPerWeek * s.sessionDurationMinutes) / 60;
    if (s.course) {
      if (s.course.batchId && batchIds.includes(s.course.batchId)) addHours(s.course.batchId, s.roomTypeNeeded, hours, { code: s.course.code, title: s.course.title, semester: s.course.semesterNumber, section: s.sectionLabel, combined: false });
    } else if (s.group) {
      for (const m of s.group.members) {
        if (m.course.isOffered && m.course.batchId && batchIds.includes(m.course.batchId)) addHours(m.course.batchId, s.roomTypeNeeded, hours, { code: m.course.code, title: m.course.title, semester: m.course.semesterNumber, section: s.sectionLabel, combined: true });
      }
    }
  }
  const programs = Array.from(new Set(batches.map((b) => b.degreeProgram))).sort();
  const terms = Array.from(new Set(batches.map((b) => b.batchName))).sort();
  const programTermMatrix = {
    programs, terms,
    // Rooms needed is a rough estimate, not an exact minimum: hours needed
    // divided by how many hours a single room can offer per week (same
    // per-room week used for the institution-wide availableHoursPerWeek
    // figures above), rounded up. It assumes perfect back-to-back packing
    // with no clashes between this program's own sections, which a real
    // timetable rarely achieves — treat it as a floor, not a guarantee.
    cells: batches.map((b) => {
      const h = hoursByBatch.get(b.id) || { theory: 0, lab: 0 };
      return {
        program: b.degreeProgram, term: b.batchName,
        theoryHours: Math.round(h.theory * 10) / 10, labHours: Math.round(h.lab * 10) / 10,
        theoryRoomsNeeded: hoursPerWeek > 0 ? Math.ceil(h.theory / hoursPerWeek) : 0,
        labRoomsNeeded: hoursPerWeek > 0 ? Math.ceil(h.lab / hoursPerWeek) : 0,
        details: (detailsByBatch.get(b.id) || []).sort((x, y) => (x.semester ?? 0) - (y.semester ?? 0) || x.code.localeCompare(y.code)),
      };
    }),
  };

  return NextResponse.json({
    needsAdjustment,
    clubbed: { offered: clubbedOfferedCount, withSectionsGenerated: clubbedWithSectionsCount },
    theory: { ...theory, availableHoursPerWeek: Math.round(theory.roomCount * hoursPerWeek * 10) / 10 },
    lab: { ...lab, availableHoursPerWeek: Math.round(lab.roomCount * hoursPerWeek * 10) / 10 },
    offeredCoursesCount: courses.length,
    offeredGroupsCount: groups.length,
    programTermMatrix,
    note: "Room-hour availability is an approximation based on the union of your batches' working-day windows; it assumes any room can be used at any of those hours.",
  });
}
