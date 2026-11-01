import { test, expect, type APIRequestContext, type BrowserContext } from "@playwright/test";
import { createHash } from "crypto";
import { PASSWORD, json, signIn, signInStudent, testDb } from "./helpers";

// Part 6 build B: secure online quizzes from the question bank — different orders per student, leaving full-screen 3
// times auto-submits and shows on the monitor, copy / paste blocked, Safe Exam Browser required / accepted, MCQ marks
// into the quiz item and its CLOs, students can't see the bank, numerical tolerance, a dropped connection resumes
// without an event, a make-up draws different questions.
test.describe.configure({ mode: "serial" });
const any = (db: unknown) => db as Record<string, any>;
const PIN = "2468";
let T: APIRequestContext; let course: { id: string; code: string }; let instId = ""; const qids: string[] = []; let numId = "";
const studs: { id: string; rollNumber: string; ctx?: BrowserContext }[] = [];
const quizIds: string[] = [];
const sp = async (c: BrowserContext, data: Record<string, unknown>, headers: Record<string, string> = {}) => { const r = await c.request.post("/api/student/secure-quiz", { data, headers }); return { s: r.status(), d: await json(r) }; };
const tp = async (data: Record<string, unknown>) => { const r = await T.post("/api/quiz-secure", { data }); return { s: r.status(), d: await json(r) }; };

test.beforeAll(async ({ playwright, browser }) => {
  const db = await testDb();
  const ins = await db.user.findUniqueOrThrow({ where: { username: "dream.instructor" } });
  // A course of dream.instructor with students whose result is not approved / submitted (marks can still go in).
  const locked = ((await any(db).courseResult.findMany({ where: { status: { in: ["APPROVED", "SUBMITTED"] } }, select: { courseId: true } })) as { courseId: string }[]).map((r) => r.courseId);
  const c = await db.course.findFirstOrThrow({ where: { instructorId: ins.id, studentEnrollments: { some: {} }, id: { notIn: locked.concat("none") } }, orderBy: { code: "asc" }, select: { id: true, code: true } });
  course = c;
  T = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL }); await signIn(T, "dream.instructor");
  await any(db).qbPin.deleteMany({ where: { userId: ins.id } });
  expect((await json(await T.post("/api/qbank", { data: { action: "pinSet", pin: PIN, password: PASSWORD } }))).set).toBe(true);
  const bank = await json(await T.get(`/api/qbank?courseId=${c.id}`));
  expect(bank.error, JSON.stringify(bank)).toBeUndefined();
  // The course plan's first CLO, for the questions.
  const { items } = bank; void items;
  const plan = await db.cLO.findMany({ where: { courseId: c.id }, select: { code: true }, orderBy: { code: "asc" } });
  const clo = plan[0]?.code || "CLO-1";
  for (let i = 0; i < 7; i++) {
    const r = await json(await T.post("/api/qbank", { data: { action: "add", courseId: c.id, type: "MCQ", marks: 1, text: `Secure quiz MCQ ${i} ${Date.now()} — which option is number ${i}?`, options: ["first", "second", "third", "fourth"], correct: [i % 4], cloCodes: [clo], bloom: "C1", difficulty: "EASY", visibility: "PRIVATE", force: true } }));
    expect(r.id, JSON.stringify(r)).toBeTruthy(); qids.push(r.id);
  }
  const n = await json(await T.post("/api/qbank", { data: { action: "add", courseId: c.id, type: "NUMERICAL", marks: 2, text: "g in m/s² to two decimals", numericAnswer: 9.81, tolerance: 0.05, tolMode: "ABS", cloCodes: [clo], bloom: "C3", difficulty: "MEDIUM", visibility: "PRIVATE", force: true } }));
  numId = n.id;
  instId = (await db.assessmentInstrument.create({ data: { courseId: c.id, source: "INSTRUCTOR", type: "Quiz", label: `Secure quiz e2e ${Date.now()}`, marksPct: 0, maxScore: 10 } })).id;
  const enr = await db.studentEnrollment.findMany({ where: { courseId: c.id }, take: 2, select: { student: { select: { id: true, rollNumber: true } } } });
  for (const e of enr) { const ctx = await browser.newContext(); await signInStudent(ctx, e.student.rollNumber); studs.push({ ...e.student, ctx }); }
});

test.afterAll(async () => {
  const db = await testDb();
  await any(db).quizEvent.deleteMany({ where: { quizId: { in: quizIds } } }); await any(db).quizRun.deleteMany({ where: { quizId: { in: quizIds } } });
  await any(db).quizMakeup.deleteMany({ where: { quizId: { in: quizIds } } }); await any(db).quizSetting.deleteMany({ where: { quizId: { in: quizIds } } });
  await any(db).onlineQuiz.deleteMany({ where: { id: { in: quizIds } } });
  await db.studentMark.deleteMany({ where: { instrumentId: instId } }); await db.assessmentInstrument.deleteMany({ where: { id: instId } });
  const ids = qids.concat(numId);
  await any(db).qbExt.deleteMany({ where: { itemId: { in: ids } } }); await any(db).qbMeta.deleteMany({ where: { itemId: { in: ids } } }); await any(db).qbLog.deleteMany({ where: { itemId: { in: ids } } });
  await any(db).questionBankItem.deleteMany({ where: { id: { in: ids } } });
  await any(db).qbPin.deleteMany({ where: { userId: (await db.user.findUniqueOrThrow({ where: { username: "dream.instructor" } })).id } });
  for (const s of studs) await s.ctx?.close();
  await T.dispose();
});

const create = async (extra: Record<string, unknown>) => {
  const now = Date.now();
  const r = await tp({ action: "create", courseId: course.id, title: `Secure ${now}`, instrumentId: instId, opensAt: new Date(now - 60000).toISOString(), closesAt: new Date(now + 3600000).toISOString(), durationMin: 30, ...extra });
  expect(r.s, JSON.stringify(r.d)).toBe(200); quizIds.push(r.d.id);
  expect((await json(await T.post("/api/mcq", { data: { courseId: course.id, quizId: r.d.id, action: "status", status: "PUBLISHED" } }))).error).toBeUndefined();
  return r.d.id as string;
};

test("two students get different orders; MCQ marks flow into the quiz item and its CLOs; a make-up gets different questions; students can't see the bank", async () => {
  const db = await testDb();
  const quiz = await create({ rules: [{ clo: null, bloom: "C1", count: 3 }] });
  const [a, b] = studs;
  const va = await sp(a.ctx!, { action: "start", quizId: quiz }), vb = await sp(b.ctx!, { action: "start", quizId: quiz });
  expect(va.s, JSON.stringify(va.d)).toBe(200);
  const sig = (v: Record<string, any>) => JSON.stringify(v.questions.map((q: { id: string; options: { i: number }[] }) => [q.id, q.options.map((o) => o.i)]));
  expect(sig(va.d)).not.toBe(sig(vb.d));
  expect(JSON.stringify(va.d)).not.toContain("correct");
  // Student A answers everything right.
  const keys = new Map(((await any(db).qbExt.findMany({ where: { itemId: { in: qids } } })) as { itemId: string; correctJson: string }[]).map((e) => [e.itemId, JSON.parse(e.correctJson)[0]]));
  const answers = Object.fromEntries((va.d.questions as { id: string }[]).map((q) => [q.id, keys.get(q.id)]));
  expect((await sp(a.ctx!, { action: "save", runId: va.d.runId, answers })).s).toBe(200);
  const sub = await sp(a.ctx!, { action: "submit", runId: va.d.runId });
  expect(sub.d.score).toBe(3); expect(sub.d.max).toBe(3);
  const mark = await db.studentMark.findUniqueOrThrow({ where: { studentId_instrumentId: { studentId: a.id, instrumentId: instId } } });
  expect(mark.score).toBe(10);
  expect(Object.keys(sub.d.perClo).length).toBe(1);
  // A make-up for student A: different questions by the same rules.
  expect((await tp({ action: "makeup", quizId: quiz, rollNumber: a.rollNumber, reason: "Was ill" })).s).toBe(200);
  const mk = await sp(a.ctx!, { action: "start", quizId: quiz });
  expect(mk.s, JSON.stringify(mk.d)).toBe(200);
  const first = (va.d.questions as { id: string }[]).map((q) => q.id), second = (mk.d.questions as { id: string }[]).map((q) => q.id);
  expect(second.filter((id) => first.includes(id)).length, "7 in the bank, 3 drawn: the make-up avoids the first 3").toBe(0);
  expect(await db.auditLog.count({ where: { action: "QUIZ_MAKEUP_OPENED", entityId: quiz } })).toBe(1);
  // Students never see the bank.
  expect((await a.ctx!.request.get(`/api/qbank?courseId=${course.id}`)).status()).toBe(403);
});

test("leaving full-screen 3 times auto-submits (default) and the monitor shows each event with its time; a dropped connection resumes without an event", async ({ browser }) => {
  const db = await testDb();
  const quiz = await create({ rules: [{ clo: null, bloom: "C1", count: 2 }] });
  const b = studs[1];
  const v = await sp(b.ctx!, { action: "start", quizId: quiz });
  // A dropped connection: no heartbeat for 2 minutes → on return it is lost time, not an event.
  await any(db).quizRun.update({ where: { id: v.d.runId }, data: { lastBeatAt: new Date(Date.now() - 120000) } });
  expect((await sp(b.ctx!, { action: "beat", runId: v.d.runId })).d.resumed).toBe(true);
  let run = await any(db).quizRun.findUnique({ where: { id: v.d.runId } });
  expect(run.events).toBe(0); expect(run.lostMs).toBeGreaterThan(100000);
  expect(await any(db).quizEvent.count({ where: { runId: v.d.runId, kind: "CONNECTION_LOST" } })).toBe(1);
  const e1 = await sp(b.ctx!, { action: "event", runId: v.d.runId, kind: "FULLSCREEN_EXIT", awayMs: 5000 });
  expect(e1.d.action).toBe("WARN"); expect(e1.d.left).toBe(2);
  expect((await sp(b.ctx!, { action: "event", runId: v.d.runId, kind: "FULLSCREEN_EXIT", awayMs: 7000 })).d.action).toBe("WARN");
  const e3 = await sp(b.ctx!, { action: "event", runId: v.d.runId, kind: "FULLSCREEN_EXIT", awayMs: 3000 });
  expect(e3.d.submitted).toBe(true);
  run = await any(db).quizRun.findUnique({ where: { id: v.d.runId } });
  expect(run.autoSubmitted).toBe(true);
  const mon = await json(await T.get(`/api/quiz-secure?monitor=${quiz}`));
  const row = mon.rows.find((r: { student: { id: string } }) => r.student.id === b.id);
  expect(row.line).toMatch(/left 3× — \d\d:\d\d, \d\d:\d\d, \d\d:\d\d, 15 s/);
  expect(row.log.filter((e: { kind: string }) => e.kind === "FULLSCREEN_EXIT")).toHaveLength(3);
  // The teacher's monitor page shows it too.
  const tctx = await browser.newContext(); await signIn(tctx, "dream.instructor");
  const page = await tctx.newPage();
  await page.goto(`/instructor/courses/${course.id}/quizzes/${quiz}`);
  await expect(page.locator(`[data-run="${b.rollNumber}"] [data-events]`)).toContainText("left 3×", { timeout: 20000 });
  await page.goto(`/instructor/courses/${course.id}/quizzes`);
  await expect(page.locator("[data-secure-new]")).toBeVisible();
  await tctx.close();
  const ins = await db.user.findUniqueOrThrow({ where: { username: "dream.instructor" } });
  expect(await db.notification.count({ where: { userId: ins.id, title: { contains: "left full-screen" }, createdAt: { gte: new Date(Date.now() - 600000) } } })).toBeGreaterThanOrEqual(3);
});

test("in the browser: copy and paste are blocked and recorded; a numerical answer within tolerance is marked correct", async () => {
  const db = await testDb();
  const quiz = await create({ ids: [numId], results: "NOW" });
  const a = studs[0];
  const page = await a.ctx!.newPage();
  await page.goto(`/student/quizzes/${quiz}`);
  await page.locator("[data-quiz-start]").click();
  await expect(page.locator("[data-quiz-q]")).toHaveCount(1, { timeout: 20000 });
  const blocked = await page.evaluate(() => ["copy", "paste"].map((t) => { const e = new Event(t, { cancelable: true, bubbles: true }); document.dispatchEvent(e); return e.defaultPrevented; }));
  expect(blocked).toEqual([true, true]);
  await page.locator("[data-num]").fill("9.79"); await page.locator("[data-num]").blur();
  await expect.poll(async () => (await any(db).quizRun.findFirst({ where: { quizId: quiz, studentId: a.id } }))?.answersJson || "").toContain("9.79");
  const run = await any(db).quizRun.findFirst({ where: { quizId: quiz, studentId: a.id } });
  await expect.poll(async () => any(db).quizEvent.count({ where: { runId: run.id, kind: { in: ["COPY", "PASTE"] } } })).toBe(2);
  page.once("dialog", (d) => d.accept());
  await page.locator("[data-quiz-submit]").click();
  await expect(page.locator("[data-quiz-done]")).toBeVisible();
  const done = await any(db).quizRun.findUnique({ where: { id: run.id } });
  expect(done.score).toBe(2); expect(done.events, "copy / paste are not leaving events").toBe(0);
  await page.close();
});

test("a quiz that requires Safe Exam Browser refuses a normal browser and accepts SEB with the right config key", async () => {
  const db = await testDb();
  const quiz = await create({ rules: [{ clo: null, bloom: "C1", count: 1 }], requireSeb: true });
  const a = studs[0];
  const no = await sp(a.ctx!, { action: "start", quizId: quiz });
  expect(no.s).toBe(403); expect(no.d.error).toMatch(/Open this quiz in Safe Exam Browser/);
  const file = await a.ctx!.request.get(`/api/quiz-secure?seb=${quiz}`);
  expect(file.status()).toBe(200); expect(await file.text()).toContain("<key>startURL</key>");
  const key = JSON.parse((await any(db).quizSetting.findUnique({ where: { quizId: quiz } })).settingsJson).sebConfigKey as string;
  const url = `${test.info().project.use.baseURL}/api/student/secure-quiz`;
  const bad = await sp(a.ctx!, { action: "start", quizId: quiz }, { "X-SafeExamBrowser-ConfigKeyHash": createHash("sha256").update(url + "wrong").digest("hex") });
  expect(bad.s).toBe(403);
  const ok = await sp(a.ctx!, { action: "start", quizId: quiz }, { "X-SafeExamBrowser-ConfigKeyHash": createHash("sha256").update(url + key).digest("hex"), "User-Agent": "Mozilla/5.0 (Windows NT 10.0) SEB/3.7" });
  expect(ok.s, JSON.stringify(ok.d)).toBe(200); expect(ok.d.questions).toHaveLength(1);
  const page = await a.ctx!.newPage();
  await page.goto(`/student/quizzes/${quiz}`);
  await expect(page.locator("[data-quiz-blocked]")).toContainText("Open this quiz in Safe Exam Browser");
  await page.close();
});
