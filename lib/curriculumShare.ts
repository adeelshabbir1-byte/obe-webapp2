import { prisma } from "./db";
import { writeAuditLog } from "./audit";
import { titleKey, CONTENT_PACKS, mapLectures, suggestPlo } from "./curriculumContent";
import { HEC_BSCS_2025_PLOS } from "../prisma/hec-bscs-2025";
import { editionOf } from "./consortiumAgreements";

// A course with the same name in any HEC curriculum — whatever the degree — shares its CLOs, PLO mapping and lecture
// plan: Programming Fundamentals of BS SE takes them from Programming Fundamentals of BS CS. A source on the same
// curriculum edition is preferred; any copy records where it came from (shown on the course), and only empty courses
// are filled. PLOs map by number (computing programs share the Seoul Accord PLO 1–10).

const sdb = prisma as unknown as Record<string, any>;
type Src = { key: string; fromCourseId: string | null; label: string; edition: string | null; official: boolean; clos: { statement: string; bloomLevel: string; plo: number | null; source: string | null }[]; topics: { lectureNumber: number; topic: string; subtopic: string | null; cloNumber: number | null }[]; plos: { number: number; title: string; description: string }[] };

async function pool(curriculumId: string, chairmanId: string | null) {
  const curs = await prisma.masterCurriculum.findMany({ where: { id: { not: curriculumId }, status: { not: "DRAFT" }, OR: [{ chairmanId: null }, ...(chairmanId ? [{ chairmanId }] : [])] }, select: { id: true, authority: true, title: true, version: true, chairmanId: true, plos: { select: { id: true, number: true, title: true, description: true } } } });
  const courses = await prisma.masterCourse.findMany({ where: { masterCurriculumId: { in: curs.map((c) => c.id) }, OR: [{ seedClos: { some: {} } }, { seedTopics: { some: {} } }] }, select: { id: true, title: true, masterCurriculumId: true, seedClos: { orderBy: { orderIndex: "asc" }, select: { statement: true, bloomLevel: true, mappedPloId: true, ploMappingSource: true } }, seedTopics: { orderBy: { lectureNumber: "asc" }, select: { lectureNumber: true, topic: true, subtopic: true, cloNumber: true } } } });
  const out: Src[] = courses.map((c) => {
    const cur = curs.find((x) => x.id === c.masterCurriculumId)!;
    const num = new Map(cur.plos.map((p) => [p.id, p.number]));
    return { key: titleKey(c.title), fromCourseId: c.id, label: `${cur.authority} ${cur.title} ${cur.version}`, edition: editionOf(cur.version), official: cur.chairmanId === null, clos: c.seedClos.map((x) => ({ statement: x.statement, bloomLevel: x.bloomLevel, plo: x.mappedPloId ? num.get(x.mappedPloId) ?? null : null, source: x.ploMappingSource })), topics: c.seedTopics, plos: cur.plos };
  });
  return out;
}
/** The official HEC BS CS 2025 document's content, when no curriculum built from it is in the database yet. */
function fromPack(title: string): Src | null {
  const k = CONTENT_PACKS["HEC-BS-CS-2025"].content(title);
  if (!k || !k.clos.length) return null;
  const tps = k.topics.slice(0, 32), map = mapLectures(tps, k.clos.map((c) => c.statement));
  return { key: titleKey(title), fromCourseId: null, label: "HEC BS Computer Science 2025 (official document)", edition: "2025", official: true, clos: k.clos.map((c) => ({ statement: c.statement, bloomLevel: c.bloomLevel, plo: c.plo, source: c.plo ? "HEC" : null })), topics: tps.map((t, i) => ({ lectureNumber: i + 1, topic: t, subtopic: null, cloNumber: map[i] })), plos: HEC_BSCS_2025_PLOS };
}
/** Best source for a course: same edition first, then official, then the one with most content. */
export function pick(cands: Src[], edition: string | null) {
  return cands.slice().sort((a, b) => Number(b.edition === edition) - Number(a.edition === edition) || Number(b.official) - Number(a.official) || (b.clos.length + b.topics.length) - (a.clos.length + a.topics.length))[0] || null;
}

export async function fillShared(actorId: string, curriculumId: string) {
  const cur = await prisma.masterCurriculum.findUnique({ where: { id: curriculumId }, select: { id: true, version: true, chairmanId: true } });
  if (!cur) throw new Error("Not found.");
  const edition = editionOf(cur.version);
  const src = await pool(curriculumId, cur.chairmanId);
  const by = new Map<string, Src[]>(); for (const s of src) by.set(s.key, [...(by.get(s.key) || []), s]);
  const courses = await prisma.masterCourse.findMany({ where: { masterCurriculumId: curriculumId }, select: { id: true, title: true, _count: { select: { seedClos: true, seedTopics: true } } } });
  let plos = await prisma.masterPLO.findMany({ where: { masterCurriculumId: curriculumId }, select: { id: true, number: true } });
  const done = { courses: 0, clos: 0, lectures: 0, plos: 0, other: 0 }; const labels = new Map<string, number>();
  for (const c of courses) {
    if (c._count.seedClos && c._count.seedTopics) continue;
    const pk = fromPack(c.title);
    const s = pick([...(by.get(titleKey(c.title)) || []), ...(pk ? [pk] : [])], edition);
    if (!s) continue;
    // PLOs: a curriculum with none takes the source curriculum's PLO set.
    if (!plos.length && s.plos.length) {
      await prisma.masterPLO.createMany({ data: s.plos.map((p) => ({ masterCurriculumId: curriculumId, number: p.number, title: p.title, description: p.description })), skipDuplicates: true });
      plos = await prisma.masterPLO.findMany({ where: { masterCurriculumId: curriculumId }, select: { id: true, number: true } });
      done.plos = plos.length;
    }
    const ploId = new Map(plos.map((p) => [p.number, p.id]));
    let touched = false;
    if (!c._count.seedClos && s.clos.length) {
      await prisma.masterCourseClo.createMany({ data: s.clos.map((x, i) => { const n = x.plo ?? suggestPlo(x.statement, x.bloomLevel); const id = ploId.get(n) || null; return { masterCourseId: c.id, statement: x.statement, bloomLevel: x.bloomLevel, orderIndex: i, mappedPloId: id, ploMappingSource: id ? (x.plo ? x.source || "SYSTEM" : "SYSTEM") : null }; }) });
      done.clos += s.clos.length; touched = true;
    }
    if (!c._count.seedTopics && s.topics.length) {
      await prisma.masterCourseTopic.createMany({ data: s.topics.slice(0, 32).map((t) => ({ masterCourseId: c.id, lectureNumber: t.lectureNumber, topic: t.topic, subtopic: t.subtopic, cloNumber: t.cloNumber })), skipDuplicates: true });
      done.lectures += Math.min(32, s.topics.length); touched = true;
    }
    if (touched) {
      done.courses++; if (s.edition !== edition) done.other++;
      labels.set(s.label, (labels.get(s.label) || 0) + 1);
      await sdb.masterCourseSource.upsert({ where: { masterCourseId: c.id }, create: { masterCourseId: c.id, fromCourseId: s.fromCourseId, fromLabel: s.label, sameEdition: s.edition === edition }, update: { fromCourseId: s.fromCourseId, fromLabel: s.label, sameEdition: s.edition === edition, copiedAt: new Date() } }).catch(() => null);
    }
  }
  await writeAuditLog({ actorUserId: actorId, action: "CURRICULUM_SHARED_CONTENT", entityType: "MasterCurriculum", entityId: curriculumId, metadata: { ...done, from: JSON.stringify(Object.fromEntries(labels)) } });
  if (!done.courses) return "No same-named course with CLOs or a lecture plan was found in other curricula.";
  return `Filled ${done.courses} course(s): ${done.clos} CLOs, ${done.lectures} lectures${done.plos ? `, ${done.plos} PLOs` : ""} — from ${Array.from(labels.entries()).map(([l, n]) => `${l} (${n})`).join(", ")}.${done.other ? ` ${done.other} came from another curriculum edition (marked on the course).` : ""} Nothing already entered was changed.`;
}
