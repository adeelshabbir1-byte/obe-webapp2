import { prisma } from "./db";

export type TermKey = { termName: string; year: number };

/** Every distinct term this coordinator has ever offered a course in, newest first. */
export async function getAvailableTerms(coordinatorId: string): Promise<TermKey[]> {
  const rows = await prisma.course.findMany({
    where: { coordinatorId, offeredTermName: { not: null }, offeredTermYear: { not: null } },
    distinct: ["offeredTermName", "offeredTermYear"],
    select: { offeredTermName: true, offeredTermYear: true },
  });
  const terms = rows.map((r) => ({ termName: r.offeredTermName!, year: r.offeredTermYear! }));
  terms.sort((a, b) => (b.year - a.year) || a.termName.localeCompare(b.termName));
  return terms;
}

function matchesSelectedTerms(course: { offeredTermName: string | null; offeredTermYear: number | null }, selected: TermKey[]) {
  return selected.some((t) => t.termName === course.offeredTermName && t.year === course.offeredTermYear);
}

export async function getTeacherLoadReport(coordinatorId: string, selectedTerms: TermKey[]) {
  const instructors = await prisma.user.findMany({ where: { role: "INSTRUCTOR", managedById: coordinatorId }, orderBy: { name: "asc" } });

  const courses = await prisma.course.findMany({
    where: { coordinatorId, isOffered: true },
    include: { sectionAssignments: true, batch: true },
  });
  const relevantCourses = courses.filter((c) => matchesSelectedTerms(c, selectedTerms));

  const groups = await prisma.courseEquivalenceGroup.findMany({
    where: { chairmanId: (await prisma.user.findUnique({ where: { id: coordinatorId } }))?.managedById || "" },
    include: { members: { include: { course: true } }, sectionAssignments: true },
  });
  const relevantGroups = groups.filter((g) => g.members.some((m) => matchesSelectedTerms(m.course, selectedTerms)));

  const rows = instructors.map((i) => {
    let assigned = 0;
    const details: { label: string; term: string; sections: number }[] = [];

    for (const c of relevantCourses) {
      const a = c.sectionAssignments.find((x) => x.instructorId === i.id);
      if (a) {
        assigned += a.sectionCount;
        details.push({ label: `${c.code} — ${c.title}`, term: `${c.offeredTermName} ${c.offeredTermYear}`, sections: a.sectionCount });
      }
    }
    for (const g of relevantGroups) {
      const a = g.sectionAssignments.find((x) => x.instructorId === i.id);
      if (a) {
        assigned += a.sectionCount;
        details.push({ label: `${g.name} (combined)`, term: "multiple", sections: a.sectionCount });
      }
    }

    return {
      instructorId: i.id, name: i.name, normalLoad: i.normalLoad, externalLoadCount: i.externalLoadCount,
      externalLoadNote: i.externalLoadNote, assigned, total: assigned + i.externalLoadCount,
      over: assigned + i.externalLoadCount > i.normalLoad, details,
    };
  });

  return rows;
}
