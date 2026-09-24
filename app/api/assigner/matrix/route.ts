import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { normalizeCourseType } from "../../../../lib/courseTypeColors";

// Puts course types in a sensible teaching-clustered order — General
// Education and IDS instructors are usually a distinct pool from Core/
// Elective specialists, so grouping this way keeps related rows together.
const TYPE_ORDER = ["Core", "Elective", "Lab", "IDS", "General Education", "Capstone Project", "Field Experience", "Certification", "Combined"];
function typeRank(t: string) {
  const idx = TYPE_ORDER.indexOf(normalizeCourseType(t));
  return idx === -1 ? TYPE_ORDER.length : idx;
}

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "COURSE_ASSIGNER") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const coordinators = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: user.managedById || "" } });
  const coordinatorIds = coordinators.map((c) => c.id);

  const offeredCourses = await prisma.course.findMany({
    where: { coordinatorId: { in: coordinatorIds }, isOffered: true },
    orderBy: [{ semesterNumber: "asc" }, { code: "asc" }],
    include: { batch: true, sectionAssignments: true, equivalenceMember: true, customCategory: true },
  });

  const groups = await prisma.courseEquivalenceGroup.findMany({
    where: { chairmanId: user.managedById || "", members: { some: { course: { isOffered: true } } } },
    include: { members: { where: { course: { isOffered: true } }, include: { course: { include: { batch: true, customCategory: true } } } }, sectionAssignments: true },
  });

  const standaloneCourses = offeredCourses.filter((c) => !c.equivalenceMember);

  let rows = [
    ...standaloneCourses.map((c) => {
      const studentCount = c.batch?.studentCount || 0;
      return {
        kind: "course" as const,
        id: c.id,
        code: c.code,
        label: `${c.code} — ${c.title}`,
        title: c.title,
        courseType: normalizeCourseType(c.courseType),
        batchLabel: c.batch ? `${c.batch.degreeProgram} — ${c.batch.batchName}` : "—",
        customCategoryName: c.customCategory?.name || null,
        studentCount,
        sectionsNeeded: Math.max(1, Math.ceil(studentCount / 50)),
        assignments: Object.fromEntries(c.sectionAssignments.map((a) => [a.instructorId, a.sectionCount])),
      };
    }),
    ...groups.map((g) => {
      const studentCount = g.members.reduce((sum, m) => sum + (m.course.batch?.studentCount || 0), 0);
      return {
        kind: "group" as const,
        id: g.id,
        code: null as string | null,
        label: g.name,
        title: g.name,
        courseType: "Combined",
        batchLabel: g.members.map((m) => m.course.batch ? `${m.course.batch.degreeProgram} — ${m.course.batch.batchName}` : "—").join("; "),
        customCategoryName: g.members[0]?.course.customCategory?.name || null,
        studentCount,
        sectionsNeeded: Math.max(1, Math.ceil(studentCount / 50)),
        assignments: Object.fromEntries(g.sectionAssignments.map((a) => [a.instructorId, a.sectionCount])),
      };
    }),
  ];
  // Sort rows so same-type courses sit together (Core block, Elective block, etc.)
  rows = rows.sort((a, b) => typeRank(a.courseType) - typeRank(b.courseType) || a.label.localeCompare(b.label));

  const instructors = await prisma.user.findMany({
    where: { managedById: { in: coordinatorIds }, role: { in: ["INSTRUCTOR", "SUBJECT_EXPERT"] } },
    include: { customCategory: true },
  });

  // Every faculty member's own stated priority for the course codes
  // actually in this matrix — the color-coded hint, and the basis for
  // nudging high-affinity instructor/course pairs closer together below.
  const codesInMatrix = Array.from(new Set(rows.map((r) => r.code).filter((c): c is string => !!c)));
  const priorityRecords = await prisma.facultyCoursePreference.findMany({
    where: { facultyId: { in: instructors.map((i) => i.id) }, courseCode: { in: codesInMatrix } },
  });
  const priorities: Record<string, Record<string, number>> = {};
  for (const p of priorityRecords) {
    if (!priorities[p.courseCode]) priorities[p.courseCode] = {};
    priorities[p.courseCode][p.facultyId] = p.priority;
  }

  // "Missing coverage" feedback — an offered course nobody expressed any
  // interest in at all — surfaced separately so it's not buried in the grid.
  const uncoveredCodes = codesInMatrix.filter((code) => !priorities[code] || Object.keys(priorities[code]).length === 0);
  const strongCodes = codesInMatrix.filter((code) => priorities[code] && Object.values(priorities[code]).some((p) => p === 1));

  const shortNameRecords = await prisma.courseShortName.findMany({ where: { chairmanId: user.managedById || "", courseCode: { in: codesInMatrix } } });
  const shortNames: Record<string, string> = Object.fromEntries(shortNameRecords.map((s) => [s.courseCode, s.shortName]));

  // Historical teaching pattern per instructor, across every semester ever
  // recorded — both direct assignment and the section-assignment matrix.
  const [allDirectCourses, allSectionAssignments] = await Promise.all([
    prisma.course.findMany({ where: { coordinatorId: { in: coordinatorIds }, instructorId: { not: null } }, select: { instructorId: true, courseType: true } }),
    prisma.courseSectionAssignment.findMany({ where: { course: { coordinatorId: { in: coordinatorIds } } }, include: { course: { select: { courseType: true } } } }),
  ]);

  const typeCountByInstructor = new Map<string, Record<string, number>>();
  function bump(instructorId: string | null, type: string) {
    if (!instructorId) return;
    const t = normalizeCourseType(type);
    const existing = typeCountByInstructor.get(instructorId) || {};
    existing[t] = (existing[t] || 0) + 1;
    typeCountByInstructor.set(instructorId, existing);
  }
  for (const c of allDirectCourses) bump(c.instructorId, c.courseType);
  for (const a of allSectionAssignments) bump(a.instructorId, a.course.courseType);

  function dominantTypeFor(instructorId: string): string | null {
    const counts = typeCountByInstructor.get(instructorId);
    if (!counts) return null;
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  }

  // Cluster instructors: group by dominant course type taught historically
  // (those with no history yet fall to the end), so instructors who tend to
  // teach similar things end up next to each other in the matrix. Within
  // that, break ties by how strongly they've prioritized courses actually
  // in this matrix — someone who rated several of these top-priority sorts
  // ahead of someone with no stated interest, nudging high-affinity pairs
  // visually closer together.
  function avgPriorityFor(instructorId: string): number {
    const scores = codesInMatrix.map((code) => priorities[code]?.[instructorId]).filter((p): p is number => p !== undefined);
    if (scores.length === 0) return 99; // no stated preference at all — sorts last within its cluster
    return scores.reduce((a, b) => a + b, 0) / scores.length;
  }

  const instructorRows = instructors
    .map((i) => ({
      id: i.id, name: i.name, normalLoad: i.normalLoad, externalLoadCount: i.externalLoadCount,
      externalLoadNote: i.externalLoadNote, specialization: i.specialization,
      customCategoryName: i.customCategory?.name || null,
      dominantType: dominantTypeFor(i.id),
    }))
    .sort((a, b) => {
      const ra = a.dominantType ? typeRank(a.dominantType) : TYPE_ORDER.length + 1;
      const rb = b.dominantType ? typeRank(b.dominantType) : TYPE_ORDER.length + 1;
      return ra - rb || avgPriorityFor(a.id) - avgPriorityFor(b.id) || a.name.localeCompare(b.name);
    });

  return NextResponse.json({ rows, instructors: instructorRows, priorities, uncoveredCodes, strongCodes, shortNames });
}
