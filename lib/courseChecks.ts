import { prisma } from "./db";
import { isTeachingTopic } from "./courseProgress";

export type CourseIssue = { text: string; fix: "clos" | "schedule" | "weights" | "instruments" };

/** Everything still missing in one course plan (SE or Instructor copy), each with the tab that fixes it. */
export async function courseIssues(courseId: string, source: "SE" | "INSTRUCTOR"): Promise<CourseIssue[]> {
  const [clos, rows, insts, mapped] = await Promise.all([
    prisma.cLO.findMany({ where: { courseId, source }, orderBy: { orderIndex: "asc" }, select: { id: true, code: true, mappedPloId: true } }),
    prisma.lectureRow.findMany({ where: { courseId, source }, select: { cloId: true, topic: true, instrumentLinks: { select: { instrumentId: true } } } }),
    prisma.assessmentInstrument.findMany({ where: { courseId, source }, select: { id: true, label: true, marksPct: true, type: true, cloId: true, partOfId: true } }),
    prisma.coursePloMapping.findMany({ where: { courseId }, select: { ploId: true, plo: { select: { number: true } } } }),
  ]);
  const out: CourseIssue[] = [];
  const list = (xs: string[]) => (xs.length > 4 ? `${xs.slice(0, 4).join(", ")} and ${xs.length - 4} more` : xs.join(", "));
  if (!clos.length) return [{ text: "No CLOs yet.", fix: "clos" }];
  const noPlo = clos.filter((c) => !c.mappedPloId).map((c) => c.code);
  if (noPlo.length) out.push({ text: `${list(noPlo)} not mapped to a PLO.`, fix: "clos" });
  const served = new Set(clos.map((c) => c.mappedPloId).filter(Boolean));
  const unserved = mapped.filter((m) => !served.has(m.ploId)).map((m) => `PLO-${m.plo.number}`);
  if (unserved.length) out.push({ text: `${list(unserved)} assigned to the course but no CLO serves it.`, fix: "clos" });
  const teaching = rows.filter((r) => isTeachingTopic(r.topic));
  if (!teaching.length) out.push({ text: "No lecture topics yet.", fix: "schedule" });
  else {
    const noTopic = clos.filter((c) => !teaching.some((r) => r.cloId === c.id)).map((c) => c.code);
    if (noTopic.length) out.push({ text: `${list(noTopic)} has no lecture topic.`, fix: "schedule" });
    const loose = teaching.filter((r) => !r.cloId).length;
    if (loose) out.push({ text: `${loose} lecture topic${loose > 1 ? "s are" : " is"} not linked to a CLO.`, fix: "schedule" });
  }
  if (!insts.length) out.push({ text: "No assessments yet.", fix: "instruments" });
  else {
    const total = Math.round(insts.reduce((s, i) => s + i.marksPct, 0) * 100) / 100;
    if (Math.abs(total - 100) > 0.01) out.push({ text: `Assessment marks add up to ${total}%, not 100%.`, fix: "weights" });
    const linked = new Set(rows.flatMap((r) => r.instrumentLinks.map((l) => l.instrumentId)));
    const hasParts = new Set(insts.map((i) => i.partOfId).filter(Boolean));
    const unlinked = insts.filter((i) => !linked.has(i.id) && !i.cloId && !hasParts.has(i.id) && i.marksPct > 0).map((i) => i.label);
    if (unlinked.length) out.push({ text: `${list(unlinked)} not linked to any lecture topic.`, fix: "instruments" });
    const tested = new Set([...rows.filter((r) => r.instrumentLinks.length && r.cloId).map((r) => r.cloId), ...insts.map((i) => i.cloId).filter(Boolean)]);
    const untested = clos.filter((c) => !tested.has(c.id)).map((c) => c.code);
    if (untested.length) out.push({ text: `${list(untested)} not assessed by any quiz, assignment or exam.`, fix: "instruments" });
  }
  return out;
}
