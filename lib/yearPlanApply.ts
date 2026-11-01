import { prisma } from "./db";
import type { Plan, PRow } from "./yearPlan";

// The approved year plan feeds the term's section assignments (Adeel prompt §25.1, §25.13, §36.1): every row of an
// existing batch course gets its teachers' section counts (CourseSectionAssignment), the course's main instructor is set
// when it has none, and the Course Leads are picked again. Projected intakes and Summer stay in the plan until their
// batch courses exist. Checks used while editing: lab.sameTeacher (§31.3a), the ODL two-course limit (ODL 13.1.2) and
// the university's faculty approval for affiliated colleges (§30.6).
const J = <T>(s: string, d: T): T => { try { return JSON.parse(s) as T; } catch { return d; } };
const db = prisma as unknown as Record<string, any>;

export async function applyPlan(plan: Plan) {
  const rows = J<PRow[]>(plan.rowsJson, []).filter((r) => !r.summer && !/expected|Repeaters/i.test(r.batch));
  const batches = await prisma.batch.findMany({ where: { coordinator: { managedById: plan.chairmanId } }, select: { id: true, degreeProgram: true, batchName: true } });
  let done = 0;
  for (const r of rows) {
    const [prog, name] = r.batch.split(" — ");
    const b = batches.find((x) => x.degreeProgram === prog && x.batchName === name);
    if (!b) continue;
    const c = await prisma.course.findFirst({ where: { batchId: b.id, code: r.code }, select: { id: true, instructorId: true } });
    if (!c) continue;
    const keep = r.teachers.filter((t) => t.n > 0);
    await prisma.courseSectionAssignment.deleteMany({ where: { courseId: c.id, instructorId: { notIn: keep.map((t) => t.id).concat("none") } } });
    for (const t of keep) await prisma.courseSectionAssignment.upsert({ where: { courseId_instructorId: { courseId: c.id, instructorId: t.id } }, create: { courseId: c.id, instructorId: t.id, sectionCount: t.n }, update: { sectionCount: t.n } });
    if (!c.instructorId && keep[0]) await prisma.course.update({ where: { id: c.id }, data: { instructorId: keep[0].id } });
    done++;
  }
  await (await import("./autoLead")).ensureAutoLeads(plan.chairmanId).catch(() => null);
  return done;
}

const base = (code: string) => code.toUpperCase().replace(/-?L$/, "");
const isLab = (code: string) => /-?L$/i.test(code);
/** Problems with one row's teachers before it is saved (empty = fine). */
export async function rowProblems(plan: Plan, row: PRow, teachers: { id: string; name: string; n: number }[]) {
  const out: string[] = [];
  const rows = J<PRow[]>(plan.rowsJson, []);
  const same = await import("./scopedSettings").then(async (m) => (await m.allStored(plan.chairmanId)).find((s) => s.key === "lab.sameTeacher" && s.scopeType === "INSTITUTE")?.value === "1").catch(() => false);
  if (same) {
    const p = rows.find((x) => x.term === row.term && x.batch === row.batch && x.key !== row.key && base(x.code) === base(row.code) && isLab(x.code) !== isLab(row.code));
    if (p && p.teachers.length && teachers.length && p.teachers.map((t) => t.id).sort().join() !== teachers.map((t) => t.id).sort().join()) out.push(`Controller setting: the same teacher teaches ${row.code} and ${p.code}.`);
  }
  const odl = ((await db.collabProgramme?.findMany({ where: { chairmanId: plan.chairmanId, kind: { in: ["ODL_PROGRAM", "ODL_COURSE"] } } }).catch(() => [])) || []) as { dataJson: string }[];
  const odlCodes = new Set(odl.flatMap((p) => (J<{ courses?: { code: string }[] }>(p.dataJson, {}).courses || []).map((c) => c.code.toUpperCase())));
  if (odlCodes.has(row.code.toUpperCase())) for (const t of teachers) {
    const n = rows.filter((x) => x.term === row.term && x.key !== row.key && odlCodes.has(x.code.toUpperCase()) && x.teachers.some((y) => y.id === t.id)).length;
    if (n >= 2) out.push(`${t.name} already has two ODL courses in ${row.term} — at most two per semester (ODL 13.1.2).`);
  }
  for (const t of teachers) { const why = await (await import("./affGate")).facultyBlock(plan.chairmanId, t.name, row.code).catch(() => null); if (why) out.push(why); }
  return out;
}
