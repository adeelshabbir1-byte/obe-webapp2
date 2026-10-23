import { randomUUID } from "crypto";
import { prisma } from "./db";
import { evdb, sectionTeachers } from "./evaluations";
import { allQuestions, settingsFor, type Kind, type Question } from "./questionnaires";
import { termIndex } from "./termLogic";
import { notifyUsers } from "./notifications";

// Student feedback, analysed:
//  • per question: how many students gave each rating (5★ … 1★), the average, and the total out of 100 —
//    Σ(question average ÷ 5 × its weight) ÷ Σ weights × 100;
//  • per teacher across batches: every course's figures side by side, the lifetime average of each question, questions
//    that are consistently low (below the teacher's own average and the department's), and the trend by term;
//  • how strict or generous each batch is: its average across all the teachers it rated in the term, against the
//    institute's — and each teacher's ADJUSTED score: their score minus the norm of the batch that rated them, added to
//    the institute's average ("3.9 from a batch averaging 3.3 → +0.6");
//  • feedback → workshop → improvement: a low question's FDP topic, the matching session, the invitation, and the
//    question's score before and after.

const fdb = prisma as unknown as Record<string, any>;
export type Term = { name: string; year: number };
export const termOf = (s?: string | null): Term | null => { const m = /^(Fall|Spring|Summer)-(\d{4})$/.exec(s || ""); return m ? { name: m[1], year: Number(m[2]) } : null; };
export const termKey = (t: Term) => `${t.name}-${t.year}`;
const tIdx = (t: Term) => termIndex(t.name, t.year) + (t.name === "Summer" ? 0.5 : 0);
const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

type Ans = { courseId: string; studentId: string; kind: Kind; answers: Record<string, number>; comment: string | null };
export type QLine = { key: string; text: string; group: string; weight: number; n: number; counts: number[]; avg: number | null };
export type Breakdown = { n: number; lines: QLine[]; total: number | null; score: number | null };

/** One answer's weighted score (1–5). */
function answerScore(a: Record<string, number>, qs: Question[]) {
  let t = 0, w = 0;
  for (const q of qs) { const v = Number(a[q.key]); if (v >= 1 && v <= 5 && q.weight > 0) { t += v * q.weight; w += q.weight; } }
  return w ? t / w : null;
}
export function breakdown(rows: Ans[], qs: Question[]): Breakdown {
  const lines: QLine[] = qs.map((q) => {
    const counts = [0, 0, 0, 0, 0];
    for (const r of rows) { const v = Math.round(Number(r.answers[q.key])); if (v >= 1 && v <= 5) counts[v - 1]++; }
    const n = counts.reduce((a, b) => a + b, 0);
    return { key: q.key, text: q.text, group: q.group, weight: q.weight, n, counts, avg: n ? r2(counts.reduce((a, c, i) => a + c * (i + 1), 0) / n) : null };
  }).filter((l) => l.n > 0 || !qs.find((q) => q.key === l.key)?.retired);
  const answered = lines.filter((l) => l.avg !== null && l.weight > 0);
  const W = answered.reduce((a, l) => a + l.weight, 0);
  const total = W ? r1((answered.reduce((a, l) => a + ((l.avg as number) / 5) * l.weight, 0) / W) * 100) : null;
  return { n: rows.length, lines, total, score: total === null ? null : r2((total / 100) * 5) };
}

async function load(courseIds: string[]): Promise<Ans[]> {
  const rows = (await evdb.courseEvaluation.findMany({ where: { courseId: { in: courseIds.concat("none") } }, select: { courseId: true, studentId: true, kind: true, answersJson: true, comment: true } }).catch(() => [])) as { courseId: string; studentId: string; kind: Kind; answersJson: string; comment: string | null }[];
  return rows.map((r) => { let a: Record<string, number> = {}; try { a = JSON.parse(r.answersJson); } catch { a = {}; } return { courseId: r.courseId, studentId: r.studentId, kind: r.kind, answers: a, comment: r.comment }; });
}

type CourseRow = { id: string; code: string; title: string; batchId: string | null; batch: { degreeProgram: string; batchName: string } | null; offeredTermName: string | null; offeredTermYear: number | null; instructorId: string | null; coordinator: { departmentId: string | null } };
const COURSE_SELECT = { id: true, code: true, title: true, batchId: true, batch: { select: { degreeProgram: true, batchName: true } }, offeredTermName: true, offeredTermYear: true, instructorId: true, coordinator: { select: { departmentId: true } } } as const;

/** Terms of the institute that have feedback, latest first. */
export async function feedbackTerms(chairmanId: string): Promise<Term[]> {
  const cs = await prisma.course.findMany({ where: { coordinator: { managedById: chairmanId }, offeredTermName: { not: null }, offeredTermYear: { not: null } }, select: { id: true, offeredTermName: true, offeredTermYear: true } });
  const withAns = new Set(((await evdb.courseEvaluation.groupBy({ by: ["courseId"], where: { courseId: { in: cs.map((c) => c.id).concat("none") } } }).catch(() => [])) as { courseId: string }[]).map((x) => x.courseId));
  const seen = new Map<string, Term>();
  for (const c of cs) if (withAns.has(c.id)) { const t = { name: c.offeredTermName!, year: c.offeredTermYear! }; seen.set(termKey(t), t); }
  return Array.from(seen.values()).sort((a, b) => tIdx(b) - tIdx(a));
}

export type Section = { courseId: string; code: string; title: string; batchId: string | null; batch: string; teacherId: string; teacher: string; departmentId: string | null; teacherB: Breakdown; courseB: Breakdown; comments: string[]; raw: number | null; norm: number | null; delta: number | null; adjusted: number | null; shown: boolean };
export type BatchNorm = { batchId: string; label: string; n: number; teachers: number; perQ: Record<string, number>; score: number | null; total: number | null; vs: number | null };

/** Everything for one term: every section's breakdown, the batch norms, the institute norm and the teacher ranking. */
// A short memo, so a page that needs the same term for many teachers (the appraisal list) works it out once.
const memo = new Map<string, { at: number; v: Promise<Awaited<ReturnType<typeof termFeedbackNow>>> }>();
export function termFeedback(chairmanId: string, term: Term, opts: { courseIds?: string[] } = {}) {
  if (opts.courseIds) return termFeedbackNow(chairmanId, term, opts);
  const k = `${chairmanId}|${termKey(term)}`, hit = memo.get(k);
  if (hit && Date.now() - hit.at < 60_000) return hit.v;
  const v = termFeedbackNow(chairmanId, term, opts);
  memo.set(k, { at: Date.now(), v });
  if (memo.size > 50) memo.delete(memo.keys().next().value as string);
  return v;
}
async function termFeedbackNow(chairmanId: string, term: Term, opts: { courseIds?: string[] } = {}) {
  const [qT, qC, settings] = await Promise.all([allQuestions(chairmanId, "TEACHER"), allQuestions(chairmanId, "COURSE"), settingsFor(chairmanId)]);
  const allTerm = (await prisma.course.findMany({ where: { coordinator: { managedById: chairmanId }, offeredTermName: term.name, offeredTermYear: term.year }, select: COURSE_SELECT })) as CourseRow[];
  const ans = await load(allTerm.map((c) => c.id));
  const sec = await sectionTeachers(allTerm.map((c) => c.id));
  const teacherAns = ans.filter((a) => a.kind === "TEACHER");
  const courseOf = new Map(allTerm.map((c) => [c.id, c]));

  // Norms: every teacher answer of the term, by the batch of the students who gave it.
  const byBatch = new Map<string, Ans[]>();
  for (const a of teacherAns) { const b = courseOf.get(a.courseId)?.batchId || "none"; byBatch.set(b, [...(byBatch.get(b) || []), a]); }
  const inst = breakdown(teacherAns, qT);
  const scoreOf = (rows: Ans[]) => { const xs = rows.map((r) => answerScore(r.answers, qT)).filter((x): x is number => x !== null); return xs.length ? r2(xs.reduce((a, b) => a + b, 0) / xs.length) : null; };
  const instScore = scoreOf(teacherAns);
  const batches: BatchNorm[] = Array.from(byBatch.entries()).filter(([id]) => id !== "none").map(([id, rows]) => {
    const c = allTerm.find((x) => x.batchId === id);
    const b = breakdown(rows, qT);
    const score = scoreOf(rows);
    const teachers = new Set(rows.map((r) => sec.teacherOf(r.courseId, r.studentId)).filter((t) => t !== "?")).size;
    return { batchId: id, label: c?.batch ? `${c.batch.degreeProgram} — ${c.batch.batchName}` : "—", n: rows.length, teachers, perQ: Object.fromEntries(b.lines.filter((l) => l.avg !== null).map((l) => [l.key, l.avg as number])), score, total: b.total, vs: score !== null && instScore !== null ? r2(score - instScore) : null };
  }).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const normOf = new Map(batches.map((b) => [b.batchId, b.score]));

  const wanted = opts.courseIds ? allTerm.filter((c) => opts.courseIds!.includes(c.id)) : allTerm;
  const teacherIds = new Set<string>();
  const sections: Omit<Section, "teacher">[] = [];
  for (const c of wanted) {
    const mine = teacherAns.filter((a) => a.courseId === c.id);
    const groups = new Map<string, Ans[]>();
    for (const a of mine) { const t = sec.teacherOf(c.id, a.studentId); groups.set(t, [...(groups.get(t) || []), a]); }
    if (!groups.size && c.instructorId) groups.set(c.instructorId, []);
    const courseRows = ans.filter((a) => a.courseId === c.id && a.kind === "COURSE");
    for (const [teacherId, rows] of Array.from(groups.entries())) {
      teacherIds.add(teacherId);
      const raw = scoreOf(rows), norm = c.batchId ? normOf.get(c.batchId) ?? null : null;
      const delta = raw !== null && norm !== null ? r2(raw - norm) : null;
      sections.push({ courseId: c.id, code: c.code, title: c.title, batchId: c.batchId, batch: c.batch ? `${c.batch.degreeProgram} — ${c.batch.batchName}` : "—", teacherId, departmentId: c.coordinator.departmentId,
        teacherB: breakdown(rows, qT), courseB: breakdown(courseRows, qC), comments: [...rows, ...courseRows].map((r) => r.comment).filter((x): x is string => !!x),
        raw, norm, delta, adjusted: delta !== null && instScore !== null ? r2(Math.max(1, Math.min(5, instScore + delta))) : null, shown: rows.length >= settings.minResponses });
    }
  }
  const names = new Map((await prisma.user.findMany({ where: { id: { in: Array.from(teacherIds).filter((t) => t !== "?").concat("none") } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const full: Section[] = sections.map((s) => ({ ...s, teacher: s.teacherId === "?" ? "Teacher not identified" : names.get(s.teacherId) || "—" }));

  // Ranking: each teacher's sections together, answer-weighted.
  const per = new Map<string, Section[]>();
  for (const s of full) if (s.teacherId !== "?") per.set(s.teacherId, [...(per.get(s.teacherId) || []), s]);
  const ranking = Array.from(per.entries()).map(([teacherId, ss]) => {
    const n = ss.reduce((a, s) => a + s.teacherB.n, 0);
    const wavg = (f: (s: Section) => number | null) => { let t = 0, w = 0; for (const s of ss) { const v = f(s); if (v !== null && s.teacherB.n) { t += v * s.teacherB.n; w += s.teacherB.n; } } return w ? r2(t / w) : null; };
    return { teacherId, teacher: ss[0].teacher, sections: ss.length, n, raw: wavg((s) => s.raw), adjusted: wavg((s) => s.adjusted), total: wavg((s) => s.teacherB.total), shown: n >= settings.minResponses };
  }).sort((a, b) => (b.adjusted ?? 0) - (a.adjusted ?? 0));

  return { term, settings, questions: { TEACHER: qT, COURSE: qC }, institute: { breakdown: inst, score: instScore, n: teacherAns.length }, batches, sections: full, ranking };
}

export type HistoryRow = { term: string; idx: number; code: string; title: string; batch: string; n: number; total: number | null; perQ: Record<string, number | null>; delta: number | null; adjusted: number | null };
export type Flag = { key: string; text: string; avg: number; courses: number; own: number; dept: number | null; fdpTopic: string | null };

/** One teacher across every course and batch they were rated in. */
export async function teacherHistory(chairmanId: string, teacherId: string) {
  const qT = await allQuestions(chairmanId, "TEACHER");
  const me = await prisma.user.findUnique({ where: { id: teacherId }, select: { id: true, name: true, departmentId: true } });
  const courses = (await prisma.course.findMany({ where: { coordinator: { managedById: chairmanId }, offeredTermName: { not: null }, OR: [{ instructorId: teacherId }, { sectionAssignments: { some: { instructorId: teacherId } } }] }, select: COURSE_SELECT })) as CourseRow[];
  const terms = new Map<string, Term>();
  for (const c of courses) if (c.offeredTermName && c.offeredTermYear) { const t = { name: c.offeredTermName, year: c.offeredTermYear }; terms.set(termKey(t), t); }
  const rows: HistoryRow[] = [];
  const mineAll: Ans[] = [];
  for (const t of Array.from(terms.values()).sort((a, b) => tIdx(a) - tIdx(b))) {
    const tf = await termFeedback(chairmanId, t, { courseIds: courses.filter((c) => c.offeredTermName === t.name && c.offeredTermYear === t.year).map((c) => c.id) });
    for (const s of tf.sections.filter((x) => x.teacherId === teacherId)) {
      rows.push({ term: `${t.name} ${t.year}`, idx: tIdx(t), code: s.code, title: s.title, batch: s.batch, n: s.teacherB.n, total: s.teacherB.total, perQ: Object.fromEntries(s.teacherB.lines.map((l) => [l.key, l.avg])), delta: s.delta, adjusted: s.adjusted });
    }
  }
  const ans = (await load(courses.map((c) => c.id))).filter((a) => a.kind === "TEACHER");
  const sec = await sectionTeachers(courses.map((c) => c.id));
  for (const a of ans) if (sec.teacherOf(a.courseId, a.studentId) === teacherId) mineAll.push(a);
  const life = breakdown(mineAll, qT);
  // The department: every teacher answer of courses of the same department.
  let deptLife: Breakdown | null = null;
  if (me?.departmentId) {
    const dc = await prisma.course.findMany({ where: { coordinator: { managedById: chairmanId, departmentId: me.departmentId }, offeredTermName: { not: null } }, select: { id: true } });
    deptLife = breakdown((await load(dc.map((c) => c.id))).filter((a) => a.kind === "TEACHER"), qT);
  }
  const ownAvg = life.lines.filter((l) => l.avg !== null).reduce((a, l, _i, xs) => a + (l.avg as number) / xs.length, 0);
  const flags: Flag[] = life.lines.filter((l) => l.avg !== null && l.key !== "overall").map((l) => {
    const courseCount = rows.filter((r) => r.perQ[l.key] !== null && r.perQ[l.key] !== undefined).length;
    const dept = deptLife?.lines.find((x) => x.key === l.key)?.avg ?? null;
    return { key: l.key, text: l.text, avg: l.avg as number, courses: courseCount, own: r2(ownAvg), dept, fdpTopic: qT.find((q) => q.key === l.key)?.fdpTopic || null };
  }).filter((f) => f.courses >= 2 && f.avg < f.own - 0.25 && (f.dept === null || f.avg < f.dept - 0.15)).sort((a, b) => a.avg - b.avg);
  // Trend: the total by term.
  const trend = Array.from(new Set(rows.map((r) => r.term))).map((term) => {
    const rs = rows.filter((r) => r.term === term && r.total !== null);
    const n = rs.reduce((a, r) => a + r.n, 0);
    return { term, total: n ? r1(rs.reduce((a, r) => a + (r.total as number) * r.n, 0) / n) : null, adjusted: n ? r2(rs.filter((r) => r.adjusted !== null).reduce((a, r) => a + (r.adjusted as number) * r.n, 0) / Math.max(1, rs.filter((r) => r.adjusted !== null).reduce((a, r) => a + r.n, 0))) : null };
  });
  return { teacher: me, questions: qT, rows, life, dept: deptLife, flags, trend };
}

// ---------------------------------------------------------------- feedback → workshop → improvement
const words = (s: string) => new Set(s.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3 && !["and", "with", "skills", "teaching", "students", "student"].includes(w)));
/** Upcoming FDP sessions that match a question's FDP topic. */
export async function matchingSessions(chairmanId: string, topic: string | null) {
  if (!topic) return [];
  const want = words(topic);
  const ss = (await fdb.fdpSession.findMany({ where: { chairmanId, status: { not: "CANCELLED" }, date: { gte: new Date(Date.now() - 864e5) } }, orderBy: { date: "asc" } }).catch(() => [])) as { id: string; title: string; topic: string | null; date: Date; hours: number }[];
  return ss.filter((s) => { const have = words(`${s.title} ${s.topic || ""}`); let hit = 0; for (const w of Array.from(want)) if (have.has(w)) hit++; return hit >= 1; })
    .map((s) => ({ id: s.id, title: s.title, date: s.date.toISOString().slice(0, 10), hours: s.hours }));
}

export async function inviteToFdp(chairmanId: string, sessionId: string, userId: string, questionKey: string, scoreBefore: number | null) {
  const s = (await fdb.fdpSession.findFirst({ where: { id: sessionId, chairmanId } })) as { id: string; title: string; date: Date; hours: number } | null;
  if (!s) throw new Error("Session not found.");
  const q = (await allQuestions(chairmanId, "TEACHER")).find((x) => x.key === questionKey);
  await fdb.feedbackFdpInvite.upsert({ where: { sessionId_userId: { sessionId, userId } }, create: { id: randomUUID(), chairmanId, sessionId, userId, questionKey, scoreBefore }, update: { questionKey, scoreBefore } });
  await notifyUsers([userId], { kind: "FDP", title: `Invitation: ${s.title} (${s.date.toISOString().slice(0, 10)})`, body: `Suggested from your student feedback on “${q?.text || questionKey}”. ${s.hours} hour(s) count towards your FDP target.`, href: "/fdp" });
}

/** Invitations, whether the teacher attended, and the question's score before and after the session. */
export async function workshopEffects(chairmanId: string) {
  const inv = (await fdb.feedbackFdpInvite.findMany({ where: { chairmanId }, orderBy: { invitedAt: "desc" } }).catch(() => [])) as { sessionId: string; userId: string; questionKey: string; scoreBefore: number | null; invitedAt: Date }[];
  if (!inv.length) return [];
  const [sessions, att, qT] = await Promise.all([
    fdb.fdpSession.findMany({ where: { id: { in: inv.map((i) => i.sessionId) } } }).catch(() => []) as Promise<{ id: string; title: string; date: Date; hours: number; status: string }[]>,
    fdb.fdpAttendance.findMany({ where: { sessionId: { in: inv.map((i) => i.sessionId) }, attended: true } }).catch(() => []) as Promise<{ sessionId: string; userId: string }[]>,
    allQuestions(chairmanId, "TEACHER"),
  ]);
  const names = new Map((await prisma.user.findMany({ where: { id: { in: inv.map((i) => i.userId) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const out = [];
  for (const i of inv) {
    const s = sessions.find((x) => x.id === i.sessionId);
    if (!s) continue;
    const h = await teacherHistory(chairmanId, i.userId);
    const sIdx = s.date.getUTCMonth() >= 7 ? termIndex("Fall", s.date.getUTCFullYear()) : termIndex("Spring", s.date.getUTCFullYear()) - 0.25;
    const after = h.rows.filter((r) => r.idx > sIdx && typeof r.perQ[i.questionKey] === "number");
    const before = h.rows.filter((r) => r.idx <= sIdx && typeof r.perQ[i.questionKey] === "number");
    const avgOf = (rs: HistoryRow[]) => { const n = rs.reduce((a, r) => a + r.n, 0); return n ? r2(rs.reduce((a, r) => a + (r.perQ[i.questionKey] as number) * r.n, 0) / n) : null; };
    out.push({ teacher: names.get(i.userId) || "—", userId: i.userId, question: qT.find((q) => q.key === i.questionKey)?.text || i.questionKey, session: s.title, date: s.date.toISOString().slice(0, 10), hours: s.hours, attended: att.some((a) => a.sessionId === s.id && a.userId === i.userId), before: i.scoreBefore ?? avgOf(before), after: avgOf(after) });
  }
  return out;
}
