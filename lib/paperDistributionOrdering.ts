import { prisma } from "./db";

/** Re-sequences a course's paper distribution items (for one source, SE or
 * INSTRUCTOR, and one exam — Midterm or Final) so questionNo always runs
 * 1, 2, 3... in orderIndex order within that exam, with no gaps and never
 * manually typed. Midterm and Final each number independently — adding a
 * question to one never shifts the other's numbers. */
export async function renumberPaperDistribution(courseId: string, source: string, examType?: string | null) {
  // examType === undefined (not passed at all) means "don't filter by
  // exam type" — kept for any older caller. Pass null explicitly to
  // scope to the legacy "no exam type set" bucket, or a real value
  // ("Midterm"/"Final") to scope to just that paper.
  const where = examType === undefined ? { courseId, source } : { courseId, source, examType };
  const items = await prisma.paperDistributionItem.findMany({
    where, orderBy: { orderIndex: "asc" },
  });
  for (let i = 0; i < items.length; i++) {
    if (items[i].orderIndex !== i || items[i].questionNo !== i + 1) {
      await prisma.paperDistributionItem.update({ where: { id: items[i].id }, data: { orderIndex: i, questionNo: i + 1 } });
    }
  }
}
