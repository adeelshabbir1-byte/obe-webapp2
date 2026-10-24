import { prisma } from "./db";
import { writeAuditLog } from "./audit";
import { titleKey, CONTENT_PACKS, mapLectures, suggestPlo, cd2023Books } from "./curriculumContent";
import { HEC_BSCS_2025_PLOS } from "../prisma/hec-bscs-2025";
import { CD2023_PLOS } from "./computing2023Content";
import { editionOf } from "./consortiumAgreements";
import { courseKeys } from "./curriculumEquivalence";

// Equivalent courses fill each other's gaps. Two courses are the same course when they have the same name in any
// curriculum (whatever the degree) or an equivalence table pairs them (PU ↔ HEC 2025, PU ↔ NCEAC 2023 — each table
// only within its own edition). Each missing part — CLOs with their PLO mapping, the 32-lecture plan, the outline,
// the textbook, the reference books — is taken separately from the best course that has it: same curriculum
// edition first, then official, then the one with most content. Only empty parts are filled; the source is recorded
// and shown on the course. Running it on every curriculum makes the exchange go both ways.

const sdb = prisma as unknown as Record<string, any>;
type Src = {
  keys: Set<string>; fromCourseId: string | null; label: string; edition: string | null; official: boolean;
  clos: { statement: string; bloomLevel: string; plo: number | null; source: string | null }[];
  topics: { lectureNumber: number; topic: string; subtopic: string | null; cloNumber: number | null }[];
  plos: { number: number; title: string; description: string }[];
  outline: string | null; textbook: string | null; references: string | null;
};
type Part = "clos" | "topics" | "outline" | "textbook" | "references";
const PART_LABEL: Record<Part, string> = { clos: "CLOs", topics: "lecture plan", outline: "outline", textbook: "textbook", references: "reference books" };

/** Keys a course meets its equivalents under. Group keys carry their edition, so a 2023 table never pairs 2025 courses. */
export function keysOf(title: string, edition: string | null) {
  const eds = edition === "2025" || edition === "2023" ? [edition] : (["2025", "2023"] as const);
  const out = new Set<string>([titleKey(title)]);
  for (const e of eds) for (const k of courseKeys(title, e as "2025" | "2023")) out.add(k.startsWith("g") ? `${e}:${k}` : k);
  return out;
}
const meets = (a: Set<string>, b: Set<string>) => Array.from(a).some((k) => b.has(k));
const has = (s: Src, p: Part) => (p === "clos" ? s.clos.length > 0 : p === "topics" ? s.topics.length > 0 : !!s[p]);

async function pool(curriculumId: string | null, chairmanId: string | null) {
  const curs = await prisma.masterCurriculum.findMany({ where: { ...(curriculumId ? { id: { not: curriculumId } } : {}), OR: [{ chairmanId: null }, ...(chairmanId ? [{ chairmanId }] : [])] }, select: { id: true, authority: true, title: true, version: true, chairmanId: true, plos: { select: { id: true, number: true, title: true, description: true } } } });
  const courses = await prisma.masterCourse.findMany({
    where: { masterCurriculumId: { in: curs.map((c) => c.id) }, OR: [{ seedClos: { some: {} } }, { seedTopics: { some: {} } }, { catalogDescription: { not: null } }, { textbook: { not: null } }, { referenceMaterial: { not: null } }] },
    select: { id: true, title: true, masterCurriculumId: true, catalogDescription: true, textbook: true, referenceMaterial: true, seedClos: { orderBy: { orderIndex: "asc" }, select: { statement: true, bloomLevel: true, mappedPloId: true, ploMappingSource: true } }, seedTopics: { orderBy: { lectureNumber: "asc" }, select: { lectureNumber: true, topic: true, subtopic: true, cloNumber: true } } },
  });
  return courses.map((c): Src & { curriculumId: string } => {
    const cur = curs.find((x) => x.id === c.masterCurriculumId)!;
    const num = new Map(cur.plos.map((p) => [p.id, p.number]));
    const edition = editionOf(cur.version);
    return { curriculumId: cur.id, keys: keysOf(c.title, edition), fromCourseId: c.id, label: `${cur.authority} ${cur.title} ${cur.version}`, edition, official: cur.chairmanId === null,
      clos: c.seedClos.map((x) => ({ statement: x.statement, bloomLevel: x.bloomLevel, plo: x.mappedPloId ? num.get(x.mappedPloId) ?? null : null, source: x.ploMappingSource })),
      topics: c.seedTopics, plos: cur.plos, outline: c.catalogDescription?.trim() || null, textbook: c.textbook?.trim() || null, references: c.referenceMaterial?.trim() || null };
  });
}
/** The official HEC BS CS 2025 document's content (CLOs only; it gives no outlines or books). */
function fromPack(title: string): Src | null {
  const k = CONTENT_PACKS["HEC-BS-CS-2025"].content(title);
  if (!k || !k.clos.length) return null;
  const tps = k.topics.slice(0, 32), map = mapLectures(tps, k.clos.map((c) => c.statement));
  return { keys: keysOf(title, "2025"), fromCourseId: null, label: "HEC BS Computer Science 2025 (official document)", edition: "2025", official: true, clos: k.clos.map((c) => ({ statement: c.statement, bloomLevel: c.bloomLevel, plo: c.plo, source: c.plo ? "HEC" : null })), topics: tps.map((t, i) => ({ lectureNumber: i + 1, topic: t, subtopic: null, cloNumber: map[i] })), plos: HEC_BSCS_2025_PLOS, outline: null, textbook: null, references: null };
}
/** HEC/NCEAC Computing Disciplines 2023: CLOs, outline-derived lecture plan, outline text and reference books. */
function from2023(title: string): Src | null {
  const k = CONTENT_PACKS["NCEAC-BS-SE-2023"].content(title), b = cd2023Books(title);
  if (!k && !b) return null;
  const clos = k?.clos || [], topics = k?.topics || [];
  const map = mapLectures(topics, clos.map((c) => c.statement));
  return { keys: keysOf(title, "2023"), fromCourseId: null, label: "HEC/NCEAC Computing Disciplines 2023 (official document)", edition: "2023", official: true,
    clos: clos.map((c) => ({ statement: c.statement, bloomLevel: c.bloomLevel, plo: null, source: null })), topics: topics.map((t, i) => ({ lectureNumber: i + 1, topic: t, subtopic: null, cloNumber: clos.length ? map[i] : null })), plos: CD2023_PLOS,
    outline: b?.outline || null, textbook: b?.textbook || null, references: b?.references.length ? b.references.join("\n") : null };
}
const size = (s: Src) => s.clos.length + s.topics.length + Number(!!s.outline) + Number(!!s.textbook);
/** Best source: same edition first, then official, then the one with most content. */
export function pick(cands: Src[], edition: string | null) {
  return cands.slice().sort((a, b) => Number(b.edition === edition) - Number(a.edition === edition) || Number(b.official) - Number(a.official) || size(b) - size(a))[0] || null;
}

type Done = { courses: number; clos: number; lectures: number; outlines: number; books: number; plos: number; other: number; labels: Map<string, number> };
const blank = (): Done => ({ courses: 0, clos: 0, lectures: 0, outlines: 0, books: 0, plos: 0, other: 0, labels: new Map() });

async function fillOne(curriculumId: string, srcAll: (Src & { curriculumId?: string })[], done: Done) {
  const cur = await prisma.masterCurriculum.findUnique({ where: { id: curriculumId }, select: { id: true, version: true } });
  if (!cur) return;
  const edition = editionOf(cur.version);
  const src = srcAll.filter((s) => s.curriculumId !== curriculumId);
  const courses = await prisma.masterCourse.findMany({ where: { masterCurriculumId: curriculumId }, select: { id: true, title: true, catalogDescription: true, textbook: true, referenceMaterial: true, _count: { select: { seedClos: true, seedTopics: true } } } });
  let plos = await prisma.masterPLO.findMany({ where: { masterCurriculumId: curriculumId }, select: { id: true, number: true } });
  for (const c of courses) {
    const need: Part[] = [];
    if (!c._count.seedClos) need.push("clos");
    if (!c._count.seedTopics) need.push("topics");
    if (!c.catalogDescription?.trim()) need.push("outline");
    if (!c.textbook?.trim()) need.push("textbook");
    if (!c.referenceMaterial?.trim()) need.push("references");
    if (!need.length) continue;
    const keys = keysOf(c.title, edition);
    const pk = fromPack(c.title), p23 = from2023(c.title);
    const cands = [...src.filter((s) => meets(keys, s.keys)), ...(pk ? [pk] : []), ...(p23 ? [p23] : [])];
    if (!cands.length) continue;
    const got: { part: Part; s: Src }[] = [];
    for (const part of need) { const s = pick(cands.filter((x) => has(x, part)), edition); if (s) got.push({ part, s }); }
    // The lecture plan's CLO numbers belong to the CLOs they came with — take both from the same course when CLOs are copied.
    const cloSrc = got.find((g) => g.part === "clos")?.s;
    if (cloSrc) { const t = got.find((g) => g.part === "topics"); if (t && has(cloSrc, "topics")) t.s = cloSrc; }
    if (!got.length) continue;
    if (cloSrc && !plos.length && cloSrc.plos.length) {
      await prisma.masterPLO.createMany({ data: cloSrc.plos.map((p) => ({ masterCurriculumId: curriculumId, number: p.number, title: p.title, description: p.description })), skipDuplicates: true });
      plos = await prisma.masterPLO.findMany({ where: { masterCurriculumId: curriculumId }, select: { id: true, number: true } });
      done.plos += plos.length;
    }
    const ploId = new Map(plos.map((p) => [p.number, p.id]));
    const data: Record<string, unknown> = {};
    for (const { part, s } of got) {
      if (part === "clos") {
        await prisma.masterCourseClo.createMany({ data: s.clos.map((x, i) => { const n = x.plo ?? suggestPlo(x.statement, x.bloomLevel); const id = ploId.get(n) || null; return { masterCourseId: c.id, statement: x.statement, bloomLevel: x.bloomLevel, orderIndex: i, mappedPloId: id, ploMappingSource: id ? (x.plo ? x.source || "SYSTEM" : "SYSTEM") : null }; }) });
        done.clos += s.clos.length;
      } else if (part === "topics") {
        await prisma.masterCourseTopic.createMany({ data: s.topics.slice(0, 32).map((t) => ({ masterCourseId: c.id, lectureNumber: t.lectureNumber, topic: t.topic, subtopic: t.subtopic, cloNumber: t.cloNumber })), skipDuplicates: true });
        done.lectures += Math.min(32, s.topics.length);
      } else if (part === "outline") { data.catalogDescription = s.outline!.slice(0, 20000); done.outlines++; }
      else if (part === "textbook") { data.textbook = s.textbook!.slice(0, 1000); done.books++; }
      else { data.referenceMaterial = s.references!.slice(0, 5000); }
    }
    if (Object.keys(data).length) await prisma.masterCourse.update({ where: { id: c.id }, data });
    done.courses++;
    const bySrc = new Map<Src, Part[]>(); for (const g of got) bySrc.set(g.s, [...(bySrc.get(g.s) || []), g.part]);
    const label = Array.from(bySrc.entries()).map(([s, ps]) => (bySrc.size > 1 ? `${ps.map((p) => PART_LABEL[p]).join(", ")}: ${s.label}` : s.label)).join("; ");
    const main = cloSrc || got[0].s;
    const same = Array.from(bySrc.keys()).every((s) => s.edition === edition);
    if (!same) done.other++;
    for (const s of Array.from(bySrc.keys())) done.labels.set(s.label, (done.labels.get(s.label) || 0) + 1);
    const prev = (await sdb.masterCourseSource.findUnique({ where: { masterCourseId: c.id } }).catch(() => null)) as { fromLabel: string; sameEdition: boolean } | null;
    const fromLabel = (prev && !prev.fromLabel.includes(label) ? `${prev.fromLabel}; ${label}` : label).slice(0, 1000);
    await sdb.masterCourseSource.upsert({ where: { masterCourseId: c.id }, create: { masterCourseId: c.id, fromCourseId: main.fromCourseId, fromLabel, sameEdition: same }, update: { fromCourseId: main.fromCourseId, fromLabel, sameEdition: same && (prev?.sameEdition ?? true), copiedAt: new Date() } }).catch(() => null);
  }
}

function summary(done: Done, scope: string) {
  if (!done.courses) return `No equivalent course had anything missing in ${scope}.`;
  return `Filled ${done.courses} course(s) in ${scope}: ${done.clos} CLOs, ${done.lectures} lectures, ${done.outlines} outlines, ${done.books} textbooks${done.plos ? `, ${done.plos} PLOs` : ""} — from ${Array.from(done.labels.entries()).map(([l, n]) => `${l} (${n})`).join(", ")}.${done.other ? ` ${done.other} took something from another curriculum edition (marked on the course).` : ""} Nothing already entered was changed.`;
}

/** Fill this curriculum's empty parts from its equivalent courses everywhere. */
export async function fillShared(actorId: string, curriculumId: string) {
  const cur = await prisma.masterCurriculum.findUnique({ where: { id: curriculumId }, select: { id: true, chairmanId: true } });
  if (!cur) throw new Error("Not found.");
  const done = blank();
  await fillOne(curriculumId, await pool(curriculumId, cur.chairmanId), done);
  await writeAuditLog({ actorUserId: actorId, action: "CURRICULUM_SHARED_CONTENT", entityType: "MasterCurriculum", entityId: curriculumId, metadata: { courses: done.courses, clos: done.clos, lectures: done.lectures, outlines: done.outlines, books: done.books, from: JSON.stringify(Object.fromEntries(done.labels)) } });
  return summary(done, "this curriculum");
}

/** Super Admin: every unpublished official curriculum exchanges with every other — both ways. Published versions stay read-only. */
export async function exchangeAll(actorId: string) {
  const curs = await prisma.masterCurriculum.findMany({ where: { chairmanId: null, status: { not: "PUBLISHED" } }, select: { id: true } });
  const done = blank();
  // Two rounds: what one curriculum got in round 1 can then reach the others in round 2.
  for (let round = 0; round < 2; round++) { const src = await pool(null, null); for (const c of curs) await fillOne(c.id, src, done); }
  await writeAuditLog({ actorUserId: actorId, action: "CURRICULUM_SHARED_CONTENT_ALL", entityType: "MasterCurriculum", entityId: "all", metadata: { curricula: curs.length, courses: done.courses, clos: done.clos, lectures: done.lectures, outlines: done.outlines, books: done.books } });
  return summary(done, `${curs.length} unpublished official curricula`);
}
