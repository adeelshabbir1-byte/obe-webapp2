import { randomUUID } from "crypto";
import { prisma } from "./db";
import { DEMO_HEAD } from "./demoInstitute";
import { pdb } from "./ugPolicy";

// Dream University: the Program Leads have marked the obvious General Education courses (Islamic Studies, Ideology and
// Constitution, Functional English, Expository Writing, Quantitative Reasoning, Natural Science, Entrepreneurship,
// Civics). Arts & Humanities, Social Sciences and ICT are not in the schemes yet, so the checker shows what to add.
// Safe to run again: existing marks are kept.

const MARKS: [RegExp, string][] = [
  [/islamic/i, "ISLAMIC"], [/ideology|constitution/i, "IDEOLOGY"], [/functional english/i, "ENGLISH"], [/expository/i, "EXPOSITORY"],
  [/calculus|business mathematics/i, "QR"], [/probability|statistic/i, "QR"], [/applied physics/i, "NATURAL"], [/entrepreneur/i, "ENTREPRENEURSHIP"], [/civic/i, "CIVICS"],
  [/discrete|linear algebra/i, "NONE"],
];

export async function campusUgPolicy() {
  const head = await prisma.user.findUnique({ where: { username: DEMO_HEAD }, select: { id: true } });
  if (!head) throw new Error("Build the demo institute first.");
  try { await pdb.policyCourseMap.count({ where: { chairmanId: head.id } }); } catch { return ["run prisma/migration_ug_policy.sql first"]; }
  const batches = await prisma.batch.findMany({ where: { coordinator: { managedById: head.id } }, select: { id: true, degreeProgram: true, coordinatorId: true }, orderBy: { startYear: "desc" } });
  let n = 0;
  for (const program of Array.from(new Set(batches.map((b) => b.degreeProgram)))) {
    const latest = batches.find((b) => b.degreeProgram === program)!;
    const courses = await prisma.course.findMany({ where: { batchId: latest.id, isNonCredit: false }, select: { code: true, title: true } });
    const qr = new Set<string>();
    for (const c of courses) {
      const m = MARKS.find(([re]) => re.test(c.title));
      if (!m) continue;
      if (m[1] === "QR") { if (qr.size >= 2) continue; qr.add(c.code); }
      const where = { chairmanId_program_courseCode: { chairmanId: head.id, program, courseCode: c.code } };
      if (await pdb.policyCourseMap.findUnique({ where })) continue;
      await pdb.policyCourseMap.create({ data: { id: randomUUID(), chairmanId: head.id, program, courseCode: c.code, requirement: m[1], updatedById: latest.coordinatorId } });
      n++;
    }
  }
  return n ? [`${n} courses marked against the General Education requirements`] : ["already there"];
}
