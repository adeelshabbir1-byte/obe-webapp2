import { prisma } from "./db";
import { BLOOM, ploGuide } from "./obeGlossary";
import type { Q } from "./obeLessons";

// Practice questions for one HEC master course, made from its own CLOs, PLO mapping, Bloom levels and topics,
// plus any questions the OMC / Super User added for it. Same seed → same questions (stable per day).
function rng(seed: string) { let h = 2166136261; for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return () => { h += 0x6d2b79f5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function shuffle<T>(xs: T[], r: () => number) { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function withAnswer(correct: string, wrong: string[], r: () => number) { const opts = shuffle([correct, ...wrong.slice(0, 3)], r); return { options: opts, answer: opts.indexOf(correct) }; }

export async function courseQuestions(masterCourseId: string, chairmanId: string | null, seed = "") {
  const mc = await prisma.masterCourse.findUnique({ where: { id: masterCourseId }, select: { id: true, code: true, title: true, masterCurriculumId: true, seedClos: { orderBy: { orderIndex: "asc" }, select: { statement: true, bloomLevel: true, mappedPloId: true } }, seedTopics: { orderBy: { lectureNumber: "asc" }, select: { topic: true, cloNumber: true } } } });
  if (!mc) return null;
  const plos = await prisma.masterPLO.findMany({ where: { masterCurriculumId: mc.masterCurriculumId }, orderBy: { number: "asc" }, select: { id: true, number: true, title: true, description: true } });
  const r = rng(`${mc.id}:${seed}`);
  const qs: (Q & { kind: string })[] = [];
  const ploName = (p: { number: number; title: string }) => `PLO-${p.number}: ${p.title}`;
  mc.seedClos.forEach((c, i) => {
    const plo = plos.find((p) => p.id === c.mappedPloId);
    if (plo && plos.length >= 4) {
      // Distractors: the neighbouring PLOs first (the ones most often confused).
      const others = shuffle(plos.filter((p) => p.id !== plo.id), r).sort((a, b) => Math.abs(a.number - plo.number) - Math.abs(b.number - plo.number)).slice(0, 3);
      const { options, answer } = withAnswer(ploName(plo), others.map(ploName), r);
      const g = ploGuide(plo.number);
      qs.push({ kind: "plo", prompt: `${mc.code} ${mc.title} — CLO-${i + 1}: "${c.statement}". Which PLO does this CLO build?`, options, answer,
        why: `HEC maps it to ${ploName(plo)}. ${plo.description}${g ? ` In plain words: ${g.meaning} ${g.notThis}` : ""}` });
    }
    const b = BLOOM.find((x) => x.level === c.bloomLevel);
    if (b) {
      const wrong = shuffle(BLOOM.filter((x) => x.level !== b.level), r).map((x) => `${x.level} ${x.name}`);
      const { options, answer } = withAnswer(`${b.level} ${b.name}`, wrong, r);
      qs.push({ kind: "bloom", prompt: `${mc.code} — what Bloom level is CLO-${i + 1}: "${c.statement}"?`, options, answer,
        why: `${b.level} ${b.name}: typical verbs are ${b.verbs.join(", ")}. The CLO's main verb decides its level, and its exam questions must be at the same level.` });
    }
  });
  if (mc.seedClos.length >= 2) {
    const topics = shuffle(mc.seedTopics.filter((t) => t.cloNumber && t.cloNumber <= mc.seedClos.length && !/exam|review/i.test(t.topic)), r).slice(0, 4);
    for (const t of topics) {
      const right = `CLO-${t.cloNumber}: ${mc.seedClos[t.cloNumber! - 1].statement}`;
      const wrong = mc.seedClos.map((c, i) => `CLO-${i + 1}: ${c.statement}`).filter((x) => x !== right);
      const { options, answer } = withAnswer(right, shuffle(wrong, r), r);
      qs.push({ kind: "topic", prompt: `${mc.code} — the lecture topic "${t.topic}" mainly serves which CLO?`, options, answer,
        why: "Each lecture topic should serve one CLO; quizzes and exam questions on this topic then count toward that CLO's attainment." });
    }
  }
  let custom: (Q & { kind: string })[] = [];
  try {
    const rows = await (prisma as unknown as Record<string, any>).obeQuestion.findMany({ where: { OR: [{ masterCourseId: mc.id }, { courseCode: mc.code }], AND: [{ OR: [{ chairmanId: null }, ...(chairmanId ? [{ chairmanId }] : [])] }] } }) as { prompt: string; optionsJson: string; answer: number; explanation: string | null }[];
    custom = rows.map((q) => ({ kind: "custom", prompt: q.prompt, options: JSON.parse(q.optionsJson), answer: q.answer, why: q.explanation || "" }));
  } catch { custom = []; }
  return { course: { id: mc.id, code: mc.code, title: mc.title }, questions: [...custom, ...shuffle(qs, r)].slice(0, 15), available: qs.length + custom.length };
}
