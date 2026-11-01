import { randomUUID } from "crypto";
import { prisma } from "./db";
import { writeAuditLog } from "./audit";
import { notifyUsers } from "./notifications";
import { pushMark, type Quiz } from "./mcq";
import { canSee, canUse } from "./qbankCore";
import { courseCtx, items, viewerFor } from "./qbank";
import { DEFAULT_SETTINGS, COUNTED, EVENT_KINDS, EVENT_LABEL, LOST_AFTER_MS, draw, orderFor, score, onEvent, sebOk, isPhone, isSeb, configKeyOf, sebSettings, plist, type QuizSettings, type BankQ, type Rule, type Answer, type EventKind } from "./quizCore";

// Secure online quizzes from the question bank (Part 6, build B), beside the existing MCQ quizzes (OnlineQuiz): rules
// or hand-picked questions of every auto-markable type (written answers marked by the teacher), one or more attempts,
// shuffled questions and options per student, one question at a time / no going back, results now / after closing /
// never. Level 1 runs full-screen in the normal browser and records leaving full-screen, switching tab or app, losing
// focus and how long the student was away (copy, paste, right-click and print are blocked); the teacher watches live
// and is told of each event; the rule warns, auto-submits after 3 events (default) or only flags. Level 2 requires
// Safe Exam Browser (the system writes the .seb file and checks its keys). A dropped connection is recorded as lost
// time, never as an event; the student resumes within the quiz time. A make-up attempt draws different questions.

const db = prisma as unknown as Record<string, any>;
export const QUIZ_HINT = "Run prisma/migration_quiz_secure.sql in Supabase first.";
type U = { id: string; role: string; name: string };
const J = <T>(s: string | null | undefined, d: T): T => { try { return s ? (JSON.parse(s) as T) : d; } catch { return d; } };

export async function settingsOf(quizId: string): Promise<(QuizSettings & { rules: Rule[]; ids: string[] }) | null> {
  const r = await db.quizSetting?.findUnique({ where: { quizId } }).catch(() => null);
  if (!r) return null;
  return { ...DEFAULT_SETTINGS, ...J<Partial<QuizSettings>>(r.settingsJson, {}), rules: J<Rule[]>(r.rulesJson, []), ids: J<string[]>(r.idsJson, []) };
}

/** The quiz's bank: the author's usable questions of the course (approved, or their own private ones), as the marker sees them. */
export async function quizBank(quiz: { courseId: string; createdById: string }): Promise<(BankQ & { text: string; parts: { label: string; text: string; marks: number }[]; modelAnswer: string | null; reusable: boolean })[]> {
  const ctx = await courseCtx(quiz.courseId);
  const author = await prisma.user.findUniqueOrThrow({ where: { id: quiz.createdById }, select: { id: true, role: true, name: true } });
  const v = await viewerFor(author, ctx);
  return (await items(ctx.chairmanId, ctx.codes)).filter((x) => canSee(x, v) && canUse(x, author.id, false)).map((x) => ({
    id: x.id, type: x.type, cloCodes: x.cloCodes, bloom: x.bloom, difficulty: x.difficulty, marks: x.marks, text: x.text, parts: x.parts,
    options: x.type === "TRUE_FALSE" ? ["True", "False"] : J<string[]>(x.meta?.optionsJson, []), correct: x.ext?.correctJson ? J<number[]>(x.ext.correctJson, []) : x.meta?.correctIndex != null ? [x.meta.correctIndex] : [],
    numericAnswer: x.ext?.numericAnswer ?? null, tolerance: x.ext?.tolerance ?? null, tolMode: x.ext?.tolMode ?? null, modelAnswer: x.ext?.modelAnswer || x.meta?.rubric || null, reusable: !!x.ext?.reusable,
  }));
}

// ---------------------------------------------------------------- the teacher
export async function createQuiz(u: U, courseId: string, b: Record<string, any>) {
  const c = await prisma.course.findUnique({ where: { id: courseId }, select: { instructorId: true } });
  if (!c || c.instructorId !== u.id) throw new Error("Only the course's teacher creates its quizzes.");
  const { parseLocal } = await import("./mcq");
  const opensAt = parseLocal(b.opensAt), closesAt = parseLocal(b.closesAt);
  if (!(closesAt > opensAt)) throw new Error("The quiz must close after it opens.");
  const rules: Rule[] = (Array.isArray(b.rules) ? b.rules : []).map((r: Record<string, unknown>) => ({ clo: r.clo ? String(r.clo) : null, bloom: r.bloom ? String(r.bloom) : null, difficulty: r.difficulty ? String(r.difficulty) : null, count: Math.max(0, Math.min(100, Number(r.count) || 0)) })).filter((r: Rule) => r.count > 0);
  const ids: string[] = (Array.isArray(b.ids) ? b.ids : []).map(String).slice(0, 200);
  if (!rules.length && !ids.length) throw new Error("Choose the questions: rules (how many per CLO / Bloom / difficulty) or pick them by hand.");
  const s: QuizSettings = { ...DEFAULT_SETTINGS };
  for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof QuizSettings)[]) if (b[k] !== undefined) (s as Record<string, unknown>)[k] = typeof DEFAULT_SETTINGS[k] === "boolean" ? b[k] === true || b[k] === "true" : typeof DEFAULT_SETTINGS[k] === "number" ? Number(b[k]) : b[k] || null;
  s.attempts = Math.max(1, Math.min(10, s.attempts)); s.autoAfter = Math.max(1, Math.min(20, s.autoAfter));
  if (!["NOW", "AFTER_CLOSE", "NEVER"].includes(s.results)) s.results = "AFTER_CLOSE";
  if (!["WARN", "AUTO", "FLAG"].includes(s.rule)) s.rule = "AUTO";
  if (s.requireSeb) { s.level = 2; s.desktopOnly = true; }
  const id = randomUUID();
  await db.onlineQuiz.create({ data: { id, courseId, instrumentId: b.instrumentId || null, title: String(b.title || "Quiz").slice(0, 120), opensAt, closesAt, durationMin: Math.max(1, Math.min(600, Number(b.durationMin) || 20)), pickJson: JSON.stringify(ids.length ? { ids } : { secure: true }), shuffle: s.shuffleQuestions, showResults: s.results !== "NEVER", negativePct: 0, status: "DRAFT", createdById: u.id } });
  if (s.requireSeb && !s.sebConfigKey) s.sebConfigKey = configKeyOf(sebSettings(`${process.env.NEXT_PUBLIC_APP_URL || ""}/student/quizzes/${id}`, `${process.env.NEXT_PUBLIC_APP_URL || ""}/student/quizzes`));
  await db.quizSetting.create({ data: { quizId: id, settingsJson: JSON.stringify(s), rulesJson: JSON.stringify(rules), idsJson: JSON.stringify(ids) } });
  const bank = await quizBank({ courseId, createdById: u.id });
  const test = draw(bank, { ids, rules }, "check");
  await writeAuditLog({ actorUserId: u.id, action: "QUIZ_CREATED", entityType: "OnlineQuiz", entityId: id, metadata: { secure: true, seb: s.requireSeb, rules: rules.length } });
  return { id, short: test.short, count: test.ids.length };
}

/** The .seb file for a quiz that requires Safe Exam Browser (its Config Key is what the server checks). */
export async function sebFile(quizId: string, origin: string) {
  const s = await settingsOf(quizId);
  if (!s?.requireSeb) throw new Error("This quiz does not use Safe Exam Browser.");
  const settings = sebSettings(`${origin}/student/quizzes/${quizId}`, `${origin}/student/quizzes`);
  const key = configKeyOf(settings);
  if (s.sebConfigKey !== key) { const r = await db.quizSetting.findUnique({ where: { quizId } }); await db.quizSetting.update({ where: { quizId }, data: { settingsJson: JSON.stringify({ ...J(r.settingsJson, {}), sebConfigKey: key }) } }); }
  return plist(settings);
}

export async function makeup(u: U, quizId: string, studentId: string, reason: string) {
  const quiz = await db.onlineQuiz.findUnique({ where: { id: quizId } });
  const c = quiz ? await prisma.course.findUnique({ where: { id: quiz.courseId }, select: { instructorId: true } }) : null;
  if (!c || c.instructorId !== u.id) throw new Error("Only the course's teacher opens a make-up.");
  if (reason.trim().length < 3) throw new Error("Give the reason (absent, a valid problem …).");
  await db.quizMakeup.create({ data: { id: randomUUID(), quizId, studentId, reason: reason.slice(0, 300), byId: u.id, until: new Date(Date.now() + 7 * 86400000) } });
  await writeAuditLog({ actorUserId: u.id, action: "QUIZ_MAKEUP_OPENED", entityType: "OnlineQuiz", entityId: quizId, metadata: { studentId, reason: reason.slice(0, 200) } });
  return { ok: true };
}

/** The live monitor: students in progress and done, with their events. */
export async function monitor(quizId: string) {
  const runs = (await db.quizRun.findMany({ where: { quizId }, orderBy: { startedAt: "asc" } })) as Run[];
  const events = (await db.quizEvent.findMany({ where: { quizId }, orderBy: { at: "asc" } })) as { runId: string; kind: string; at: Date; awayMs: number | null }[];
  const st = new Map((await prisma.student.findMany({ where: { id: { in: runs.map((r) => r.studentId) } }, select: { id: true, name: true, rollNumber: true } })).map((s) => [s.id, s]));
  return runs.map((r) => ({ ...r, student: st.get(r.studentId), events: events.filter((e) => e.runId === r.id) }));
}

/** The teacher marks a written answer; once nothing is waiting, the mark goes to the quiz item and its CLOs. */
export async function markAnswer(u: U, runId: string, questionId: string, marks: number) {
  const run = (await db.quizRun.findUnique({ where: { id: runId } })) as Run | null;
  if (!run) throw new Error("Attempt not found.");
  const quiz = await db.onlineQuiz.findUnique({ where: { id: run.quizId } });
  const c = await prisma.course.findUnique({ where: { id: quiz.courseId }, select: { instructorId: true } });
  if (c?.instructorId !== u.id) throw new Error("Only the course's teacher marks this quiz.");
  const t = J<Record<string, number>>(run.teacherJson, {}); t[questionId] = marks;
  await db.quizRun.update({ where: { id: runId }, data: { teacherJson: JSON.stringify(t) } });
  return finalise(runId);
}

// ---------------------------------------------------------------- the student
type Run = { id: string; quizId: string; studentId: string; attemptNo: number; makeup: boolean; seed: string; questionIdsJson: string; orderJson: string; answersJson: string; teacherJson: string; startedAt: Date; submittedAt: Date | null; autoSubmitted: boolean; flagged: boolean; events: number; lostMs: number; lastBeatAt: Date | null; untilAt: Date | null; score: number | null; maxScore: number | null; perCloJson: string | null; pending: number; pos: number };
/** Start + duration + connection time lost, but never past the quiz's close (a make-up's own window instead). */
export const deadline = (r: Pick<Run, "startedAt"> & { untilAt?: Date | null }, q: { durationMin: number; closesAt: Date }, lostMs = 0) => new Date(Math.min(new Date(r.startedAt).getTime() + q.durationMin * 60000 + lostMs, new Date(r.untilAt || q.closesAt).getTime()));

/** Who may take it, from where: published and open, enrolled, Safe Exam Browser when required, a computer when required. */
export async function gate(student: { id: string }, quizId: string, req: { url: string; ua: string; configHash?: string | null; requestHash?: string | null }) {
  const quiz = await db.onlineQuiz.findUnique({ where: { id: quizId } });
  if (!quiz || quiz.status !== "PUBLISHED") return { error: "Quiz not available.", status: 404 };
  const s = await settingsOf(quizId);
  if (!s) return { error: "Not a secure quiz.", status: 400 };
  const enr = await prisma.studentEnrollment.findUnique({ where: { studentId_courseId: { studentId: student.id, courseId: quiz.courseId } } });
  if (!enr || enr.status === "WITHDRAWN") return { error: "You are not enrolled in this course.", status: 403 };
  if (s.requireSeb && !sebOk(req.url, { configHash: req.configHash, requestHash: req.requestHash }, { configKey: s.sebConfigKey, browserKey: s.sebBrowserKey })) return { error: "Open this quiz in Safe Exam Browser.", status: 403, seb: true };
  if ((s.desktopOnly || s.requireSeb) && isPhone(req.ua) && !isSeb(req.ua)) return { error: "This quiz is for a laptop or desktop computer only.", status: 403 };
  return { quiz, s };
}

export async function start(student: { id: string }, quizId: string, req: Parameters<typeof gate>[2]) {
  const g = await gate(student, quizId, req); if ("error" in g) throw Object.assign(new Error(g.error), { status: g.status, seb: (g as { seb?: boolean }).seb });
  const { quiz, s } = g;
  const now = Date.now();
  const runs = (await db.quizRun.findMany({ where: { quizId, studentId: student.id }, orderBy: { attemptNo: "asc" } })) as Run[];
  const open = runs.find((r) => !r.submittedAt);
  if (open) return resume(open, quiz);
  const mk = await db.quizMakeup.findFirst({ where: { quizId, studentId: student.id, used: false, until: { gt: new Date() } } });
  if (!mk) {
    if (now < new Date(quiz.opensAt).getTime()) throw new Error("The quiz has not opened yet.");
    if (now > new Date(quiz.closesAt).getTime()) throw new Error("The quiz has closed.");
    if (runs.length >= s.attempts) throw new Error(s.attempts === 1 ? "You have already taken this quiz." : `You have used your ${s.attempts} attempts.`);
  }
  const bank = await quizBank(quiz);
  const attemptNo = runs.length + 1;
  const seed = `${quizId}|${student.id}|${attemptNo}`;
  const exclude = new Set(mk ? runs.flatMap((r) => J<string[]>(r.questionIdsJson, [])) : []);
  const d = draw(bank, { ids: s.ids, rules: s.rules }, seed, exclude);
  if (!d.ids.length) throw new Error("This quiz has no questions yet. Tell your teacher.");
  const o = orderFor(d.ids, bank, s, seed);
  const id = randomUUID();
  await db.quizRun.create({ data: { id, quizId, studentId: student.id, attemptNo, makeup: !!mk, seed, questionIdsJson: JSON.stringify(o.questions), orderJson: JSON.stringify(o.options), answersJson: "{}", teacherJson: "{}", lastBeatAt: new Date(), untilAt: mk ? mk.until : null } });
  if (mk) await db.quizMakeup.update({ where: { id: mk.id }, data: { used: true } });
  return view(id);
}

/** Back after a dropped connection: the gap is lost time (added back), not an event. */
async function resume(run: Run, quiz: { durationMin: number; closesAt: Date }) {
  if (run.lastBeatAt) {
    const gap = Date.now() - new Date(run.lastBeatAt).getTime();
    if (gap > LOST_AFTER_MS && Date.now() < deadline(run, quiz, run.lostMs).getTime()) {
      await db.quizEvent.create({ data: { id: randomUUID(), runId: run.id, quizId: run.quizId, studentId: run.studentId, kind: "CONNECTION_LOST", awayMs: gap } });
      await db.quizRun.update({ where: { id: run.id }, data: { lostMs: run.lostMs + gap, lastBeatAt: new Date() } });
    }
  }
  return view(run.id);
}

/** What the student sees: the questions in their order, no keys; the time left; what was saved. */
export async function view(runId: string) {
  const run = (await db.quizRun.findUnique({ where: { id: runId } })) as Run;
  const quiz = await db.onlineQuiz.findUnique({ where: { id: run.quizId } });
  const s = (await settingsOf(run.quizId))!;
  const bank = new Map((await quizBank(quiz)).map((q) => [q.id, q]));
  const order = J<Record<string, number[]>>(run.orderJson, {});
  const qs = J<string[]>(run.questionIdsJson, []).map((id) => bank.get(id)).filter((q): q is NonNullable<typeof q> => !!q).map((q) => ({ id: q.id, type: q.type, text: q.text, marks: q.marks, parts: q.parts.map((p) => ({ label: p.label, text: p.text, marks: p.marks })), options: (order[q.id] || q.options.map((_, i) => i)).map((i) => ({ i, text: q.options[i] })) }));
  return { runId: run.id, quizId: run.quizId, title: quiz.title, questions: qs, answers: J<Record<string, Answer>>(run.answersJson, {}), deadline: deadline(run, quiz, run.lostMs).getTime(), submitted: !!run.submittedAt, settings: { oneAtATime: s.oneAtATime, noBack: s.noBack, rule: s.rule, autoAfter: s.autoAfter, level: s.level }, events: run.events, pos: run.pos, lostMs: run.lostMs };
}

async function runFor(student: { id: string }, runId: string) {
  const run = (await db.quizRun.findUnique({ where: { id: runId } })) as Run | null;
  if (!run || run.studentId !== student.id) throw new Error("Attempt not found.");
  return run;
}
/** Saved after every question; with "no going back", earlier questions can no longer change. */
export async function save(student: { id: string }, runId: string, answers: Record<string, unknown>, pos: number | null) {
  const run = await runFor(student, runId);
  if (run.submittedAt) throw new Error("Already submitted.");
  const quiz = await db.onlineQuiz.findUnique({ where: { id: run.quizId } });
  const s = (await settingsOf(run.quizId))!;
  if (Date.now() > deadline(run, quiz, run.lostMs).getTime() + 60000) return submit(student, runId, true);
  const ids = J<string[]>(run.questionIdsJson, []);
  const cur = J<Record<string, Answer>>(run.answersJson, {});
  for (const [k, v] of Object.entries(answers || {})) {
    const at = ids.indexOf(k); if (at < 0) continue;
    if (s.noBack && at < run.pos) continue; // already left behind
    cur[k] = Array.isArray(v) ? v.map(Number).slice(0, 10) : typeof v === "number" ? v : v === null ? null : String(v).slice(0, 20000);
  }
  const newPos = pos === null || pos === undefined ? run.pos : s.noBack ? Math.max(run.pos, Math.min(ids.length - 1, Number(pos) || 0)) : Number(pos) || 0;
  await db.quizRun.update({ where: { id: runId }, data: { answersJson: JSON.stringify(cur), pos: newPos, lastBeatAt: new Date() } });
  return { saved: true, pos: newPos };
}
export async function beat(student: { id: string }, runId: string) {
  const run = await runFor(student, runId);
  if (run.submittedAt) return { submitted: true };
  const quiz = await db.onlineQuiz.findUnique({ where: { id: run.quizId } });
  if (run.lastBeatAt && Date.now() - new Date(run.lastBeatAt).getTime() > LOST_AFTER_MS) return resume(run, quiz).then(() => ({ resumed: true }));
  await db.quizRun.update({ where: { id: runId }, data: { lastBeatAt: new Date() } });
  return { ok: true, deadline: deadline(run, quiz, run.lostMs).getTime() };
}

/** An integrity event: saved with the attempt, the teacher told; the rule decides warn / submit / flag. */
export async function event(student: { id: string }, runId: string, kind: string, awayMs: number | null) {
  if (!(EVENT_KINDS as readonly string[]).includes(kind) || kind === "CONNECTION_LOST") throw new Error("Unknown event.");
  const run = await runFor(student, runId);
  if (run.submittedAt) return { action: "NONE" };
  const s = (await settingsOf(run.quizId))!;
  const counted = (COUNTED as string[]).includes(kind);
  await db.quizEvent.create({ data: { id: randomUUID(), runId, quizId: run.quizId, studentId: run.studentId, kind, awayMs: awayMs ? Math.max(0, Math.min(3_600_000, Math.round(awayMs))) : null } });
  const n = run.events + (counted ? 1 : 0);
  const action = counted ? onEvent(s.rule, s.autoAfter, n) : "NONE";
  await db.quizRun.update({ where: { id: runId }, data: { events: n, flagged: run.flagged || (counted && s.rule === "FLAG"), lastBeatAt: new Date() } });
  const quiz = await db.onlineQuiz.findUnique({ where: { id: run.quizId } });
  const c = await prisma.course.findUnique({ where: { id: quiz.courseId }, select: { instructorId: true, code: true } });
  const st = await prisma.student.findUnique({ where: { id: run.studentId }, select: { name: true, rollNumber: true } });
  if (counted) await notifyUsers([c?.instructorId], { kind: "ALERT", title: `${quiz.title}: ${st?.name || "a student"} ${EVENT_LABEL[kind]}`, body: `${c?.code} · ${st?.rollNumber || ""} · event ${n}${awayMs ? ` · away ${Math.round(awayMs / 1000)} s` : ""}${action === "SUBMIT" ? " · auto-submitted" : ""}`, href: `/instructor/courses/${quiz.courseId}/quizzes/${quiz.id}` }).catch(() => null);
  if (action === "SUBMIT") { await submit(student, runId, true); return { action, submitted: true }; }
  return { action, events: n, left: s.rule === "AUTO" ? Math.max(0, s.autoAfter - n) : null };
}

export async function submit(student: { id: string }, runId: string, auto = false) {
  const run = await runFor(student, runId);
  if (!run.submittedAt) await db.quizRun.update({ where: { id: runId }, data: { submittedAt: new Date(), autoSubmitted: auto } });
  return finalise(runId);
}
async function finalise(runId: string) {
  const run = (await db.quizRun.findUnique({ where: { id: runId } })) as Run;
  const quiz = (await db.onlineQuiz.findUnique({ where: { id: run.quizId } })) as Quiz & { createdById: string };
  const bank = await quizBank(quiz);
  const qs = J<string[]>(run.questionIdsJson, []).map((id) => bank.find((q) => q.id === id)).filter((q): q is NonNullable<typeof q> => !!q);
  const g = score(qs, J<Record<string, Answer>>(run.answersJson, {}), J<Record<string, number>>(run.teacherJson, {}));
  await db.quizRun.update({ where: { id: runId }, data: { score: g.score, maxScore: g.max, perCloJson: JSON.stringify(g.perClo), pending: g.pending } });
  // The best finished attempt goes to the quiz item (and through it to its CLOs), once nothing waits for the teacher.
  if (!g.pending) {
    const done = ((await db.quizRun.findMany({ where: { quizId: run.quizId, studentId: run.studentId, submittedAt: { not: null }, pending: 0 } })) as Run[]);
    const best = done.reduce((a, r) => ((r.score ?? 0) / (r.maxScore || 1) > (a.score ?? 0) / (a.maxScore || 1) ? r : a), done[0]);
    if (best?.maxScore) await pushMark(quiz, run.studentId, best.score ?? 0, best.maxScore);
  }
  return { submitted: true, score: g.score, max: g.max, pending: g.pending, perClo: g.perClo };
}

/** After the quiz closes (or straight away, as set): marks per CLO and the questions got wrong; model answers only if allowed, never for reusable questions. */
export async function results(student: { id: string }, quizId: string) {
  const quiz = await db.onlineQuiz.findUnique({ where: { id: quizId } });
  const s = (await settingsOf(quizId))!;
  const runs = (await db.quizRun.findMany({ where: { quizId, studentId: student.id, submittedAt: { not: null } }, orderBy: { attemptNo: "asc" } })) as Run[];
  if (!runs.length) return null;
  const open = s.results === "NOW" || (s.results === "AFTER_CLOSE" && Date.now() > new Date(quiz.closesAt).getTime());
  if (!open) return { hidden: true, message: s.results === "NEVER" ? "Your teacher will tell you your result." : `Results appear after the quiz closes.` };
  const bank = await quizBank(quiz);
  const last = runs[runs.length - 1];
  const ans = J<Record<string, Answer>>(last.answersJson, {}); const t = J<Record<string, number>>(last.teacherJson, {});
  const { autoMark } = await import("./quizCore");
  const wrong = J<string[]>(last.questionIdsJson, []).map((id) => bank.find((q) => q.id === id)).filter((q): q is NonNullable<typeof q> => !!q).map((q) => ({ q, got: t[q.id] ?? autoMark(q, ans[q.id]) })).filter((x) => x.got !== null && x.got < x.q.marks);
  return { hidden: false, score: last.score, max: last.maxScore, pending: last.pending, perClo: J<Record<string, [number, number]>>(last.perCloJson, {}), wrong: wrong.map((w) => ({ id: w.q.id, text: w.q.text, got: w.got, marks: w.q.marks, answer: s.showAnswers && !w.q.reusable ? (w.q.type.startsWith("MCQ") || w.q.type === "TRUE_FALSE" ? w.q.correct.map((i) => w.q.options[i]).join(", ") : w.q.type === "NUMERICAL" ? String(w.q.numericAnswer) : w.q.modelAnswer) : null })) };
}
export { EVENT_LABEL, type EventKind };
