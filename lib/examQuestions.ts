import { prisma } from "./db";

// The OMC decides the minimum number of questions in the Midterm and Final papers, per course type. The Subject
// Expert's paper plan must meet it before the template can be submitted; the Instructor sees the same check on their
// own paper. Stored in its own table so a missing table never breaks the weight policy (it just means "no rule").

export const qdb = prisma as unknown as Record<string, any>;
export type QuestionRules = { midterm: number; final: number; missing: boolean };

export async function questionRulesFor(chairmanId: string | null, courseType: string): Promise<QuestionRules> {
  if (!chairmanId) return { midterm: 0, final: 0, missing: false };
  try {
    const r = await qdb.examQuestionPolicy.findUnique({ where: { chairmanId_courseType: { chairmanId, courseType } } });
    return { midterm: r?.midtermMinQuestions ?? 0, final: r?.finalMinQuestions ?? 0, missing: false };
  } catch { return { midterm: 0, final: 0, missing: true }; }
}

export async function allQuestionRules(chairmanId: string) {
  try {
    return { rows: (await qdb.examQuestionPolicy.findMany({ where: { chairmanId } })) as { courseType: string; midtermMinQuestions: number; finalMinQuestions: number }[], missing: false };
  } catch { return { rows: [], missing: true }; }
}

/** Questions planned in each paper against the OMC's minimum. */
export async function questionShortfalls(courseId: string, source: "SE" | "INSTRUCTOR") {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { courseType: true, coordinator: { select: { managedById: true } } } });
  const rules = await questionRulesFor(course?.coordinator?.managedById || null, course?.courseType || "");
  const counts = await prisma.paperDistributionItem.groupBy({ by: ["examType"], where: { courseId, source }, _count: { _all: true } });
  const n = (t: string) => counts.find((c) => c.examType === t)?._count._all || 0;
  const midterm = n("Midterm"), final = n("Final");
  const short: string[] = [];
  if (rules.midterm > 0 && midterm < rules.midterm) short.push(`the Midterm paper has ${midterm} question(s), the OMC asks for at least ${rules.midterm}`);
  if (rules.final > 0 && final < rules.final) short.push(`the Final paper has ${final} question(s), the OMC asks for at least ${rules.final}`);
  return { rules, midterm, final, short };
}
