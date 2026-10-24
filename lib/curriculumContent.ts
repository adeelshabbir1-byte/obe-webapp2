import { prisma } from "./db";
import { HEC_BSCS_2025_COURSES, HEC_BSCS_2025_PLOS } from "../prisma/hec-bscs-2025";
import { HEC_COURSE_SEED_CONTENT } from "../prisma/hec-course-seed-content";
import { HEC_GE_IDS_SEED_CONTENT } from "../prisma/hec-ge-ids-seed-content";
import { HEC_CS25_ELECTIVE_CLOS } from "./hecCs2025Clos";

// Fills a master curriculum with what makes it a master copy: semester numbers, PLOs, CLOs (each mapped to a PLO)
// and a 32-lecture plan whose lectures are mapped to CLOs. Only empty things are filled — nothing typed by a person
// is overwritten. Sources, in order of authority:
//  - HEC document: PLOs, the semester scheme, CLOs of the major and IDS courses, CLOs of the 202 track electives,
//    and the PLO tags HEC gave some elective CLOs (ploMappingSource "HEC").
//  - System: Bloom level from the CLO's verb where HEC gave none, a PLO for untagged CLOs, the lecture→CLO link
//    (ploMappingSource "SYSTEM" — shown as suggested). Lecture topics are a draft from published syllabi, since the
//    HEC document leaves course contents to departments.

type Pack = {
  plos: { number: number; title: string; description: string }[];
  semester: (title: string, kind: string, index: number) => number | null;
  content: (title: string) => { clos: { statement: string; bloomLevel: string; plo: number | null }[]; topics: string[] } | null;
};

/** Title key that survives "&"/"and", plurals, dashes and bracketed notes ("(IDS I, Mandatory)"). */
export const titleKey = (s: string) => s.toLowerCase().replace(/&/g, " and ").replace(/\([^)]*\)/g, " ").replace(/[–—-]/g, " ").split(/[^a-z0-9]+/).filter(Boolean).map((w) => (w.length > 3 ? w.replace(/s$/, "") : w)).join(" ");

const SEED = { ...HEC_COURSE_SEED_CONTENT, ...HEC_GE_IDS_SEED_CONTENT } as Record<string, { clos: { statement: string; bloomLevel: string }[]; topics: string[] }>;
const BY_TITLE = new Map(HEC_BSCS_2025_COURSES.map((c) => [titleKey(c.title), c]));
const ELECTIVES = new Map(Object.entries(HEC_CS25_ELECTIVE_CLOS).map(([t, v]) => [titleKey(t), v]));

const HEC_CS_2025: Pack = {
  plos: HEC_BSCS_2025_PLOS,
  semester(title, kind, index) {
    const c = BY_TITLE.get(titleKey(title));
    if (c) return c.semesterNumber;
    if (kind === "ELECTIVE_SLOT") return index < 4 ? 6 : 7; // Electives I–IV in semester VI, V–VIII in VII
    if (kind === "IDS") return 5; // IDS III and IV
    return null;
  },
  content(title) {
    const c = BY_TITLE.get(titleKey(title));
    const s = c ? SEED[c.code] : null;
    if (s) return { clos: s.clos.map((x) => ({ ...x, plo: null })), topics: s.topics };
    const e = ELECTIVES.get(titleKey(title));
    return e ? { clos: e.map((x) => ({ statement: x.s, bloomLevel: x.b, plo: x.p })), topics: [] } : null;
  },
};
export const CONTENT_PACKS: Record<string, Pack> = { "HEC-BS-CS-2025": HEC_CS_2025 };
export const hasContentPack = (key?: string | null) => !!key && key in CONTENT_PACKS;

/** A PLO for a CLO that HEC did not tag — by what the CLO asks for (Seoul Accord PLO 2–10). */
export function suggestPlo(statement: string, bloom: string) {
  const s = statement.toLowerCase();
  if (/ethic/.test(s)) return 9;
  if (/legal|societ|social impact|sustainab|professional responsib|regulat|policy|privacy/.test(s)) return 8;
  if (/team|collaborat|group/.test(s)) return 6;
  if (/communicat|present|report|document|writ(e|ing) (a |technical|effective)/.test(s)) return 7;
  if (/independent|self-directed|emerging|research/.test(s)) return 10;
  if (/\btools?\b|framework|platform|librar|software such as|using [a-z]+ (and|or) /.test(s)) return 5;
  if (bloom === "C6") return 4;
  if (bloom === "C4" || bloom === "C5") return 3;
  return 2;
}

const STOP = new Set("the and for with using use from into that this their such basic basics introduction review part case study advanced simple common".split(" "));
const words = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !STOP.has(w)).map((w) => w.replace(/(ing|es|s)$/, "")));
/** Which CLO each lecture serves: the CLO sharing most words with the topic, else the CLO for that stretch of the course. */
export function mapLectures(topics: string[], clos: string[]) {
  const cw = clos.map(words);
  return topics.map((t, i) => {
    const tw = words(t); let best = 0, at = -1;
    cw.forEach((w, k) => { const n = Array.from(tw).filter((x) => w.has(x)).length; if (n > best) { best = n; at = k; } });
    return at >= 0 ? at + 1 : Math.min(clos.length, Math.floor((i * clos.length) / Math.max(1, topics.length)) + 1);
  });
}

/** Fill what is empty. Returns counts of what was added. */
export async function fillContent(curriculumId: string, packKey: string, types: { name: string; kind: string }[]) {
  const pack = CONTENT_PACKS[packKey];
  if (!pack) throw new Error("No content is available for this template yet.");
  const done = { semesters: 0, plos: 0, clos: 0, lectures: 0, courses: 0 };
  if (!(await prisma.masterPLO.count({ where: { masterCurriculumId: curriculumId } }))) {
    await prisma.masterPLO.createMany({ data: pack.plos.map((p) => ({ masterCurriculumId: curriculumId, number: p.number, title: p.title, description: p.description })) });
    done.plos = pack.plos.length;
  }
  const plos = new Map((await prisma.masterPLO.findMany({ where: { masterCurriculumId: curriculumId }, select: { id: true, number: true } })).map((p) => [p.number, p.id]));
  const courses = await prisma.masterCourse.findMany({ where: { masterCurriculumId: curriculumId }, orderBy: { code: "asc" }, select: { id: true, title: true, category: true, semesterNumber: true, _count: { select: { seedClos: true, seedTopics: true } } } });
  const kindOf = new Map(types.map((t) => [t.name, t.kind]));
  const idx = new Map<string, number>();
  for (const c of courses) {
    const kind = kindOf.get(c.category) || "";
    const i = idx.get(c.category) ?? 0; idx.set(c.category, i + 1);
    let touched = false;
    if (c.semesterNumber == null && kind !== "ELECTIVE_LIST" && kind !== "IDS_LIST") {
      const sem = pack.semester(c.title, kind, i);
      if (sem) { await prisma.masterCourse.update({ where: { id: c.id }, data: { semesterNumber: sem } }); done.semesters++; touched = true; }
    }
    const k = pack.content(c.title);
    if (!k) { if (touched) done.courses++; continue; }
    if (!c._count.seedClos && k.clos.length) {
      await prisma.masterCourseClo.createMany({ data: k.clos.map((x, n) => {
        const num = x.plo ?? suggestPlo(x.statement, x.bloomLevel);
        return { masterCourseId: c.id, statement: x.statement, bloomLevel: x.bloomLevel, orderIndex: n, mappedPloId: plos.get(num) || null, ploMappingSource: plos.get(num) ? (x.plo ? "HEC" : "SYSTEM") : null };
      }) });
      done.clos += k.clos.length; touched = true;
    }
    if (!c._count.seedTopics && k.topics.length) {
      const clos = (await prisma.masterCourseClo.findMany({ where: { masterCourseId: c.id }, orderBy: { orderIndex: "asc" }, select: { statement: true } })).map((x) => x.statement);
      const map = mapLectures(k.topics, clos);
      await prisma.masterCourseTopic.createMany({ data: k.topics.slice(0, 32).map((t, n) => ({ masterCourseId: c.id, lectureNumber: n + 1, topic: t, cloNumber: clos.length ? map[n] : null })), skipDuplicates: true });
      done.lectures += Math.min(32, k.topics.length); touched = true;
    }
    if (touched) done.courses++;
  }
  return done;
}
