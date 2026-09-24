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
  // Both roles: a Subject Expert can also carry a teaching section
  // assignment just like an Instructor can, and section assignments
  // don't discriminate by role — leaving SE out here undercounts real
  // load exactly the way the Assignment Matrix already avoids doing.
  const instructors = await prisma.user.findMany({ where: { role: { in: ["INSTRUCTOR", "SUBJECT_EXPERT"] }, managedById: coordinatorId }, orderBy: { name: "asc" } });

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

  // A stable label per selected term, e.g. "Fall 2024" — used both to
  // key the per-term breakdown and to label its column in the UI.
  const termLabels = selectedTerms.map((t) => `${t.termName} ${t.year}`);

  const rows = instructors.map((i) => {
    let assigned = 0;
    const details: { label: string; term: string; sections: number }[] = [];
    const byTerm: Record<string, number> = Object.fromEntries(termLabels.map((l) => [l, 0]));

    for (const c of relevantCourses) {
      const a = c.sectionAssignments.find((x) => x.instructorId === i.id);
      if (a) {
        assigned += a.sectionCount;
        const termLabel = `${c.offeredTermName} ${c.offeredTermYear}`;
        details.push({ label: `${c.code} — ${c.title}`, term: termLabel, sections: a.sectionCount });
        if (termLabel in byTerm) byTerm[termLabel] += a.sectionCount;
      }
    }
    for (const g of relevantGroups) {
      const a = g.sectionAssignments.find((x) => x.instructorId === i.id);
      if (a) {
        assigned += a.sectionCount;
        details.push({ label: `${g.name} (combined)`, term: "multiple", sections: a.sectionCount });
        // A combined group can span courses from more than one term, so
        // its sections are split evenly across every term any of its
        // member courses actually falls in — an approximation, but a
        // far better one than dropping the group from every term column.
        const groupTermLabels = Array.from(new Set(g.members.filter((m) => matchesSelectedTerms(m.course, selectedTerms)).map((m) => `${m.course.offeredTermName} ${m.course.offeredTermYear}`)));
        if (groupTermLabels.length > 0) {
          const share = a.sectionCount / groupTermLabels.length;
          for (const label of groupTermLabels) if (label in byTerm) byTerm[label] += share;
        }
      }
    }

    return {
      instructorId: i.id, name: i.name, role: i.role, normalLoad: i.normalLoad, externalLoadCount: i.externalLoadCount,
      externalLoadNote: i.externalLoadNote, assigned, total: assigned + i.externalLoadCount,
      over: assigned + i.externalLoadCount > i.normalLoad, details, byTerm,
    };
  });

  return { rows, termLabels };
}
