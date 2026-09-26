import { prisma } from "./db";

/** Whenever a CLO gets mapped to a PLO — whether by a Subject Expert
 * choosing it deliberately, or by the keyword auto-map tools — the
 * course as a whole should show as contributing to that PLO in the
 * coarser Course<->PLO Matrix too, since a course containing even one
 * CLO for a PLO genuinely does contribute to it. One-directional and
 * additive only: this only ever creates a course-level mapping that's
 * missing, and never removes one, even if the CLO that originally
 * justified it later gets unmapped, deleted, or changed to a
 * different PLO — another CLO in the same course might still justify
 * it, or an OMC member may have set it independently on purpose. */
export async function ensureCoursePloMapping(courseId: string, ploId: string, assignedById: string) {
  const existing = await prisma.coursePloMapping.findUnique({ where: { courseId_ploId: { courseId, ploId } } });
  if (existing) return;
  await prisma.coursePloMapping.create({ data: { courseId, ploId, assignedById } }).catch(() => {
    // A concurrent request created the same mapping between the check
    // and this insert — the unique constraint already protects
    // against a duplicate, so this is a harmless race to ignore.
  });
}
