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
  const grandCurricula = await prisma.masterCurriculum.findMany({ where: { parentCurriculumId: null } });
  const created: string[] = [];

  for (const grand of grandCurricula) {
    const alreadyHasClone = await prisma.masterCurriculum.findFirst({
      where: { chairmanId, parentCurriculumId: grand.id },
    });
    if (alreadyHasClone) continue;

    const clone = await prisma.masterCurriculum.create({
      data: {
        authority: grand.authority, title: grand.title, version: `${grand.version} (your copy)`,
        sourceReference: grand.sourceReference, chairmanId, parentCurriculumId: grand.id,
      },
    });

    const plos = await prisma.masterPLO.findMany({ where: { masterCurriculumId: grand.id } });
    const ploIdMap = new Map<string, string>();
    for (const plo of plos) {
      const newPlo = await prisma.masterPLO.create({
        data: { masterCurriculumId: clone.id, number: plo.number, title: plo.title, description: plo.description },
      });
      ploIdMap.set(plo.id, newPlo.id);
    }

    const courses = await prisma.masterCourse.findMany({ where: { masterCurriculumId: grand.id } });
    for (const course of courses) {
      const newCourse = await prisma.masterCourse.create({
        data: {
          masterCurriculumId: clone.id, code: course.code, title: course.title, creditHours: course.creditHours,
          category: course.category, domain: course.domain, semesterNumber: course.semesterNumber,
          catalogDescription: course.catalogDescription, textbook: course.textbook, referenceMaterial: course.referenceMaterial,
        },
      });

      const clos = await prisma.masterCourseClo.findMany({ where: { masterCourseId: course.id }, orderBy: { orderIndex: "asc" } });
      for (const clo of clos) {
        await prisma.masterCourseClo.create({
          data: {
            masterCourseId: newCourse.id, statement: clo.statement, bloomLevel: clo.bloomLevel, orderIndex: clo.orderIndex,
            mappedPloId: clo.mappedPloId ? ploIdMap.get(clo.mappedPloId) || null : null, ploMappingSource: clo.ploMappingSource,
          },
        });
      }

      const topics = await prisma.masterCourseTopic.findMany({ where: { masterCourseId: course.id }, orderBy: { lectureNumber: "asc" } });
      for (const topic of topics) {
        await prisma.masterCourseTopic.create({
          data: { masterCourseId: newCourse.id, lectureNumber: topic.lectureNumber, topic: topic.topic, subtopic: topic.subtopic },
        });
      }
    }

    created.push(clone.id);
  }

  return created;
}
