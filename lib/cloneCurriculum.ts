import { randomUUID } from "crypto";
import { prisma } from "./db";

// Clones every grand (official, chairmanId = null) curriculum for a
// newly-created Chairman — same logic as the earlier manual
// generate_institute_clones.sql, now a real function so approving an
// account request can do this automatically in one step instead of a
// human running SQL by hand afterward. Copies MasterCurriculum ->
// MasterPLO -> MasterCourse -> MasterCourseClo -> MasterCourseTopic,
// re-mapping each CLO's PLO reference to the new clone's own PLO ids.
// Safe to call more than once for the same chairman: skips any grand
// curriculum they already have a clone of.
export async function cloneGrandCurriculaForChairman(chairmanId: string) {
  // Only the official curricula the Super User has assigned to this institute - a new institute starts with none.
  const grandCurricula = await prisma.masterCurriculum.findMany({
    where: { parentCurriculumId: null, chairmanId: null, assignments: { some: { chairmanId } } },
  });
  const created: string[] = [];
  for (const grand of grandCurricula) {
    const id = await cloneGrandCurriculumForChairman(grand, chairmanId);
    if (id) created.push(id);
  }
  return created;
}

// Gives one institute its own editable copy of one official curriculum (skips if it already has one).
export async function cloneGrandCurriculumForChairman(grand: { id: string; authority: string; title: string; version: string; sourceReference: string | null}, chairmanId: string): Promise<string | null> {
  {
    const alreadyHasClone = await prisma.masterCurriculum.findFirst({
      where: { chairmanId, parentCurriculumId: grand.id },
    });
    if (alreadyHasClone) return null;

    const clone = await prisma.masterCurriculum.create({
      data: {
        authority: grand.authority, title: grand.title, version: `${grand.version} (your copy)`,
        sourceReference: grand.sourceReference, chairmanId, parentCurriculumId: grand.id,
      },
    });

    // Bulk copy (a few queries total, not several per course) so a large curriculum clones well inside a request.
    const plos = await prisma.masterPLO.findMany({ where: { masterCurriculumId: grand.id } });
    const ploIdMap = new Map<string, string>(plos.map((p) => [p.id, randomUUID()]));
    if (plos.length > 0) {
      await prisma.masterPLO.createMany({
        data: plos.map((p) => ({ id: ploIdMap.get(p.id)!, masterCurriculumId: clone.id, number: p.number, title: p.title, description: p.description })),
      });
    }

    const courses = await prisma.masterCourse.findMany({ where: { masterCurriculumId: grand.id } });
    const courseIdMap = new Map<string, string>(courses.map((c) => [c.id, randomUUID()]));
    if (courses.length > 0) {
      await prisma.masterCourse.createMany({
        data: courses.map((c) => ({
          id: courseIdMap.get(c.id)!, masterCurriculumId: clone.id, code: c.code, title: c.title, creditHours: c.creditHours,
          category: c.category, domain: c.domain, semesterNumber: c.semesterNumber,
          catalogDescription: c.catalogDescription, textbook: c.textbook, referenceMaterial: c.referenceMaterial,
          // prerequisite links are filled in below, once every course of the copy exists
        })),
      });
    }

    const courseIds = courses.map((c) => c.id);
    const [clos, topics] = courseIds.length > 0
      ? await Promise.all([
          prisma.masterCourseClo.findMany({ where: { masterCourseId: { in: courseIds } }, orderBy: { orderIndex: "asc" } }),
          prisma.masterCourseTopic.findMany({ where: { masterCourseId: { in: courseIds } }, orderBy: { lectureNumber: "asc" } }),
        ])
      : [[], []];
    if (clos.length > 0) {
      await prisma.masterCourseClo.createMany({
        data: clos.map((clo) => ({
          masterCourseId: courseIdMap.get(clo.masterCourseId)!, statement: clo.statement, bloomLevel: clo.bloomLevel, orderIndex: clo.orderIndex,
          mappedPloId: clo.mappedPloId ? ploIdMap.get(clo.mappedPloId) || null : null, ploMappingSource: clo.ploMappingSource,
        })),
      });
    }
    if (topics.length > 0) {
      await prisma.masterCourseTopic.createMany({
        data: topics.map((t) => ({ masterCourseId: courseIdMap.get(t.masterCourseId)!, lectureNumber: t.lectureNumber, topic: t.topic, subtopic: t.subtopic })),
      });
    }

    // Carry the prerequisite links across too (re-pointed at the copy's own courses).
    for (const course of courses) {
      if (!course.prerequisiteCourseId) continue;
      const newCourseId = courseIdMap.get(course.id), newPrereqId = courseIdMap.get(course.prerequisiteCourseId);
      if (newCourseId && newPrereqId) await prisma.masterCourse.update({ where: { id: newCourseId }, data: { prerequisiteCourseId: newPrereqId } });
    }

    return clone.id;
  }
}
