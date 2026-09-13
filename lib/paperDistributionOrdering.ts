import { prisma } from "./db";

/** Re-sequences a course's paper distribution items (for one source, SE or
 * INSTRUCTOR) so questionNo always runs 1, 2, 3... in orderIndex order,
 * with no gaps and never manually typed. */
export async function renumberPaperDistribution(courseId: string, source: string) {
  const items = await prisma.paperDistributionItem.findMany({ where: { courseId, source }, orderBy: { orderIndex: "asc" } });
  for (let i = 0; i < items.length; i++) {
    if (items[i].orderIndex !== i || items[i].questionNo !== i + 1) {
      await prisma.paperDistributionItem.update({ where: { id: items[i].id }, data: { orderIndex: i, questionNo: i + 1 } });
    }
  }
}
