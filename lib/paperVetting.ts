import { prisma } from "./db";
import { computeFinalBoundary } from "./finalBoundary";

export const vtdb = prisma as unknown as Record<string, any>;
export type Vetting = { id: string; courseId: string; examType: string; status: string; questionsJson: string; systemJson: string | null; aiJson: string | null; teacherNote: string | null; submittedAt: Date | null; reviewerId: string | null; reviewNote: string | null; decidedAt: Date | null; round: number };
export type Finding = { level: "ok" | "warn" | "fail"; text: string };
const lvl = (c: string | null | undefined) => Number(String(c || "").replace(/\D/g, "")) || 0;

/** The paper's questions with their claimed CLO, Bloom level and marks, plus the course's CLOs. */
export async function paperOf(courseId: string, examType: string) {
  const [items, clos, plos] = await Promise.all([
    prisma.paperDistributionItem.findMany({ where: { courseId, source: "INSTRUCTOR", examType }, orderBy: [{ orderIndex: "asc" }, { questionNo: "asc" }], select: { id: true, questionNo: true, topicText: true, cloId: true, cognitiveLevel: true, marks: true, lectureRow: { select: { week: true } } } }),
    prisma.cLO.findMany({ where: { courseId, source: "INSTRUCTOR" }, select: { id: true, code: true, statement: true, bloomLevel: true, mappedPloId: true }, orderBy: { code: "asc" } }),
    prisma.pLO.findMany({ where: { batch: { courses: { some: { id: courseId } } } }, select: { id: true, number: true, title: true } }).catch(() => []),
  ]);
  return { items, clos, plos };
}

/** The system's own check of a paper against the course plan: CLO coverage, marks share, Bloom levels, PLOs reached. */
export async function systemCheck(courseId: string, examType: string) {
  const { items, clos, plos } = await paperOf(courseId, examType);
  const f: Finding[] = [];
  const total = items.reduce((s, i) => s + i.marks, 0);
  const cOf = new Map(clos.map((c) => [c.id, c]));
  if (!items.length) return { findings: [{ level: "fail" as const, text: "The paper has no questions." }], perClo: [], bloom: { low: 0, mid: 0, high: 0 }, total, plos: [] as string[] };
  const noClo = items.filter((i) => !i.cloId || !cOf.has(i.cloId));
  if (noClo.length) f.push({ level: "fail", text: `Questions ${noClo.map((i) => `Q${i.questionNo}`).join(", ")} are not mapped to a CLO.` });
  // Which CLOs this paper should assess: those taught in the weeks it covers.
  const boundary = await computeFinalBoundary(courseId, "INSTRUCTOR").catch(() => null);
  const mw = boundary?.midtermWeek ?? 8;
  const rows = await prisma.lectureRow.findMany({ where: { courseId, source: "INSTRUCTOR", cloId: { not: null } }, select: { week: true, cloId: true } });
  const taught = new Set(rows.filter((r) => (examType === "Midterm" ? r.week < mw : true)).map((r) => r.cloId!));
  const perClo = clos.map((c) => { const m = items.filter((i) => i.cloId === c.id).reduce((s, i) => s + i.marks, 0); return { code: c.code, bloom: c.bloomLevel, marks: m, pct: total ? Math.round((1000 * m) / total) / 10 : 0, taught: taught.has(c.id) }; });
  const missed = perClo.filter((p) => p.taught && !p.marks);
  if (missed.length) f.push({ level: "warn", text: `${missed.map((p) => p.code).join(", ")} ${missed.length > 1 ? "were" : "was"} taught in this part of the course but ${missed.length > 1 ? "are" : "is"} not assessed in this paper.` });
  const untaught = perClo.filter((p) => p.marks && !p.taught);
  if (untaught.length && examType === "Midterm") f.push({ level: "warn", text: `${untaught.map((p) => p.code).join(", ")} ${untaught.length > 1 ? "are" : "is"} assessed but not taught before the midterm (week ${mw}).` });
  const heavy = perClo.filter((p) => p.pct > 50 && perClo.filter((x) => x.marks).length > 1);
  if (heavy.length) f.push({ level: "warn", text: `${heavy[0].code} carries ${heavy[0].pct}% of the paper; consider balancing across CLOs.` });
  // Bloom: question below the CLO's own level means the CLO is not really tested.
  const below = items.filter((i) => i.cloId && cOf.get(i.cloId) && lvl(i.cognitiveLevel) && lvl(i.cognitiveLevel) < lvl(cOf.get(i.cloId)!.bloomLevel));
  if (below.length) f.push({ level: "warn", text: `${below.map((i) => `Q${i.questionNo} (${i.cognitiveLevel} vs ${cOf.get(i.cloId!)!.code} at ${cOf.get(i.cloId!)!.bloomLevel})`).join(", ")} ask below their CLO's Bloom level.` });
  const noLevel = items.filter((i) => !lvl(i.cognitiveLevel));
  if (noLevel.length) f.push({ level: "warn", text: `Questions ${noLevel.map((i) => `Q${i.questionNo}`).join(", ")} have no Bloom level.` });
  const share = (a: number, b: number) => items.filter((i) => lvl(i.cognitiveLevel) >= a && lvl(i.cognitiveLevel) <= b).reduce((s, i) => s + i.marks, 0);
  const bloom = { low: total ? Math.round((100 * share(1, 2)) / total) : 0, mid: total ? Math.round((100 * share(3, 4)) / total) : 0, high: total ? Math.round((100 * share(5, 6)) / total) : 0 };
  if (bloom.low > (examType === "Final" ? 40 : 50)) f.push({ level: "warn", text: `${bloom.low}% of marks are recall/understanding (C1–C2); the ${examType.toLowerCase()} should test more application and analysis.` });
  if (examType === "Final" && bloom.mid + bloom.high < 40) f.push({ level: "warn", text: `Only ${bloom.mid + bloom.high}% of marks are at C3 or above.` });
  const ploNum = new Map(plos.map((p) => [p.id, p.number]));
  const reached = Array.from(new Set(items.map((i) => (i.cloId ? cOf.get(i.cloId)?.mappedPloId : null)).filter((x): x is string => !!x).map((id) => `PLO-${ploNum.get(id) ?? "?"}`))).sort();
  if (!f.length) f.push({ level: "ok", text: "Every question is mapped, the CLOs taught are covered, and the Bloom spread is reasonable." });
  return { findings: f, perClo, bloom, total, plos: reached };
}

/** The AI's independent reading: for each question, which CLO it really tests and at what Bloom level. */
export async function aiCheck(cfg: { apiKey: string; model: string }, courseTitle: string, clos: { code: string; statement: string; bloomLevel: string }[], qs: { no: number; text: string; clo: string; level: string; marks: number }[]) {
  const system = "You are an outcome-based-education reviewer for a university examination committee. Judge each exam question honestly against the course learning outcomes. Reply with JSON only.";
  const prompt = `Course: ${courseTitle}\nCLOs:\n${clos.map((c) => `${c.code} (${c.bloomLevel}): ${c.statement}`).join("\n")}\n\nQuestions (teacher's claimed CLO and Bloom level):\n${qs.map((q) => `Q${q.no} [${q.marks} marks] claimed ${q.clo} ${q.level}: ${q.text}`).join("\n")}\n\nFor every question return {"q": number, "clo": best-matching CLO code, "level": Bloom level C1-C6 the question actually demands, "agrees": true if both match the claim, "comment": one short sentence, "suggestion": a better wording if it does not agree, else ""}. Then an overall {"summary": two sentences}. Reply as {"questions": [...], "summary": "..."}.`;
  const res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "Content-Type": "application/json", "x-api-key": cfg.apiKey, "anthropic-version": "2023-06-01" }, body: JSON.stringify({ model: cfg.model, max_tokens: 4000, system, messages: [{ role: "user", content: prompt }] }) });
  if (!res.ok) throw new Error(`The AI service returned an error (${res.status}).`);
  const d = await res.json();
  const text = (d.content || []).map((c: { text?: string }) => c.text || "").join("");
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("The AI reply could not be read.");
  return JSON.parse(m[0]) as { questions: { q: number; clo: string; level: string; agrees: boolean; comment: string; suggestion?: string }[]; summary: string };
}
