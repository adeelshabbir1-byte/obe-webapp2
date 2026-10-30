import { prisma } from "./db";
import { compliance, lockedCloChange, lockedCourseChange, sameCourse, type GCourseLite } from "./synthesisCore";

// Golden Copy guardrails. An institute's curriculum copied from an official HEC / NCEAC curriculum (its parent, with no
// owner, published) is the Golden Copy's institutional copy: the official template library stays separate (owner null),
// the copy belongs to the institute. In the copy, the Golden Copy's course codes, titles, credit hours, mandatory CLOs
// and core topics can't be changed or deleted; local books, lab manuals, sessional splits and elective choices can.

const db = prisma as unknown as Record<string, any>;
const POOL_KINDS = ["ELECTIVE_LIST", "IDS_LIST"];

/** The Golden Copy an institute curriculum came from, or null. */
export async function goldenOf(curriculumId: string) {
  const c = await prisma.masterCurriculum.findUnique({ where: { id: curriculumId }, select: { chairmanId: true, parentCurriculumId: true } });
  if (!c?.chairmanId || !c.parentCurriculumId) return null;
  const p = await prisma.masterCurriculum.findUnique({ where: { id: c.parentCurriculumId }, select: { id: true, chairmanId: true, status: true, authority: true, title: true, version: true } });
  return p && p.chairmanId === null && p.status !== "DRAFT" ? p : null;
}
async function lite(curriculumId: string): Promise<GCourseLite[]> {
  const [courses, types] = await Promise.all([
    prisma.masterCourse.findMany({ where: { masterCurriculumId: curriculumId }, select: { code: true, title: true, creditHours: true, category: true, seedClos: { select: { statement: true } }, seedTopics: { select: { topic: true } } } }),
    db.curriculumType.findMany({ where: { curriculumId }, select: { name: true, kind: true } }).catch(() => []) as Promise<{ name: string; kind: string }[]>,
  ]);
  const pools = new Set(types.filter((t) => POOL_KINDS.includes(t.kind)).map((t) => t.name));
  return courses.map((c) => ({ code: c.code, title: c.title, creditHours: c.creditHours, category: c.category, pool: pools.has(c.category) || /elective list|options|domain elective/i.test(c.category), clos: c.seedClos.map((x) => x.statement), topics: c.seedTopics.map((t) => t.topic).filter(Boolean) }));
}
/** The compliance meter of an institute copy (null when it isn't a Golden Copy import). */
export async function meter(curriculumId: string) {
  const g = await goldenOf(curriculumId);
  if (!g) return null;
  const [gold, mine, just] = await Promise.all([lite(g.id), lite(curriculumId), db.curriculumJustification.findUnique({ where: { curriculumId } }).catch(() => null)]);
  return { golden: g, ...compliance(gold, mine), justification: (just?.text as string | undefined) || null };
}
/** The Golden Copy's version of a course of the institute copy (by code or title), or null. */
async function goldenCourse(masterCourseId: string) {
  const mc = await prisma.masterCourse.findUnique({ where: { id: masterCourseId }, select: { code: true, title: true, masterCurriculumId: true } });
  if (!mc) return null;
  const g = await goldenOf(mc.masterCurriculumId);
  if (!g) return null;
  return (await lite(g.id)).find((x) => sameCourse(x, mc)) || null;
}
export async function guardCourse(masterCourseId: string, patch: { code?: string; title?: string; creditHours?: number; remove?: boolean }) {
  return lockedCourseChange(await goldenCourse(masterCourseId), patch);
}
export async function guardClo(cloId: string, patch: { statement?: string; remove?: boolean }) {
  const clo = await prisma.masterCourseClo.findUnique({ where: { id: cloId }, select: { statement: true, masterCourseId: true } });
  if (!clo) return null;
  const g = await goldenCourse(clo.masterCourseId);
  return g ? lockedCloChange(g.clos, clo.statement, patch) : null;
}
/** Locked parts of a course for the synthesizer: the Golden Copy's CLOs and topics, if any. */
export async function lockedContent(masterCourseId: string) {
  const g = await goldenCourse(masterCourseId);
  return g ? { clos: g.clos, topics: g.topics } : null;
}
/** Accreditation submission: refused for a program whose Golden Copy import is red, or yellow without a justification. */
export async function accreditationBlock(chairmanId: string, program: string) {
  const cs = await prisma.masterCurriculum.findMany({ where: { chairmanId, OR: [{ degreeProgram: program }, { title: program }], parentCurriculumId: { not: null } }, select: { id: true, title: true, version: true } });
  for (const c of cs) {
    const m = await meter(c.id).catch(() => null);
    if (!m) continue;
    if (m.band === "RED") return `${c.title} ${c.version} is ${m.score}% aligned with the HEC Golden Copy (red: core mandates missing — ${m.missing.slice(0, 3).join(", ")}${m.missing.length > 3 ? " …" : ""}). Restore them before submitting for accreditation.`;
    if (m.band === "YELLOW" && !m.justification) return `${c.title} ${c.version} is ${m.score}% aligned with the HEC Golden Copy (yellow): give the justification for the local changes on the curriculum page first.`;
  }
  return null;
}
