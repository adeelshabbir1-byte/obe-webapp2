import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "COURSE_ASSIGNER") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const coordinators = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: user.managedById || "" } });
  const coordinatorIds = coordinators.map((c) => c.id);

  const offeredCourses = await prisma.course.findMany({
    where: { coordinatorId: { in: coordinatorIds }, isOffered: true },
    orderBy: [{ semesterNumber: "asc" }, { code: "asc" }],
    include: { batch: true, sectionAssignments: true, equivalenceMember: true },
  });

  const groups = await prisma.courseEquivalenceGroup.findMany({
    where: { chairmanId: user.managedById || "" },
    include: { members: { include: { course: { include: { batch: true } } } }, sectionAssignments: true },
  });

  const standaloneCourses = offeredCourses.filter((c) => !c.equivalenceMember);

  const rows = [
    ...standaloneCourses.map((c) => {
      const studentCount = c.batch?.studentCount || 0;
      return {
        kind: "course" as const,
        id: c.id,
        label: `${c.code} — ${c.title}`,
        courseType: c.courseType,
        batchLabel: c.batch ? `${c.batch.degreeProgram} — ${c.batch.batchName}` : "—",
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
        label: g.name,
        courseType: "Combined",
        batchLabel: g.members.map((m) => m.course.batch ? `${m.course.batch.degreeProgram} — ${m.course.batch.batchName}` : "—").join("; "),
        studentCount,
        sectionsNeeded: Math.max(1, Math.ceil(studentCount / 50)),
        assignments: Object.fromEntries(g.sectionAssignments.map((a) => [a.instructorId, a.sectionCount])),
      };
    }),
  ];

  const instructors = await prisma.user.findMany({
    where: { role: "INSTRUCTOR", managedById: { in: coordinatorIds } },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({
    rows,
    instructors: instructors.map((i) => ({
      id: i.id, name: i.name, normalLoad: i.normalLoad, externalLoadCount: i.externalLoadCount, externalLoadNote: i.externalLoadNote,
    })),
  });
}
