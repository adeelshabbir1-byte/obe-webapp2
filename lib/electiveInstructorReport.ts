import { prisma } from "./db";
import type { TermKey } from "./loadReport";

function matchesSelectedTerms(course: { offeredTermName: string | null; offeredTermYear: number | null }, selected: TermKey[]) {
  return selected.some((t) => t.termName === course.offeredTermName && t.year === course.offeredTermYear);
}

// Who taught each Elective-type course, per degree program, across the
// terms the Coordinator picks — exactly the shape NCEAC asks for when
// reviewing who delivered a program's specialization electives.
export async function getElectiveInstructorReport(coordinatorId: string, selectedTerms: TermKey[]) {
  const courses = await prisma.course.findMany({
    where: { coordinatorId, isOffered: true, courseType: "Elective" },
    include: { sectionAssignments: { include: { instructor: true } }, batch: true },
  });
  const relevantCourses = courses.filter((c) => matchesSelectedTerms(c, selectedTerms));

  const chairmanId = (await prisma.user.findUnique({ where: { id: coordinatorId } }))?.managedById || "";
  const groups = await prisma.courseEquivalenceGroup.findMany({
    where: { chairmanId },
    include: { members: { include: { course: { include: { batch: true } } } }, sectionAssignments: { include: { instructor: true } } },
  });
  // Only groups where at least one member is itself an Elective in a
  // relevant term — a combined section that happens to include an
  // elective still needs to show up here.
  const relevantGroups = groups.filter((g) => g.members.some((m) => m.course.courseType === "Elective" && matchesSelectedTerms(m.course, selectedTerms)));

  const rows: { degreeProgram: string; batchName: string; code: string; title: string; term: string; instructorNames: string[] }[] = [];

  for (const c of relevantCourses) {
    rows.push({
      degreeProgram: c.batch?.degreeProgram || "—", batchName: c.batch?.batchName || "—",
      code: c.code, title: c.title, term: `${c.offeredTermName} ${c.offeredTermYear}`,
      instructorNames: c.sectionAssignments.map((a) => a.instructor.name),
    });
  }
  for (const g of relevantGroups) {
    const electiveMembers = g.members.filter((m) => m.course.courseType === "Elective" && matchesSelectedTerms(m.course, selectedTerms));
    for (const m of electiveMembers) {
      rows.push({
        degreeProgram: m.course.batch?.degreeProgram || "—", batchName: m.course.batch?.batchName || "—",
        code: m.course.code, title: `${m.course.title} (combined: ${g.name})`, term: `${m.course.offeredTermName} ${m.course.offeredTermYear}`,
        instructorNames: g.sectionAssignments.map((a) => a.instructor.name),
      });
    }
  }

  rows.sort((a, b) => a.degreeProgram.localeCompare(b.degreeProgram) || a.term.localeCompare(b.term) || a.code.localeCompare(b.code));
  return rows;
}
