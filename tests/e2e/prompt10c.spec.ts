import { test, expect, type APIRequestContext } from "@playwright/test";
import { json, signIn, testDb } from "./helpers";

// Prompt 10 build C: FDP over several days (section 7), AI checks with a mocked model (section 8), visiting faculty and
// biometric pay (section 10).
test.describe.configure({ mode: "serial" });
const any = (db: unknown) => db as Record<string, any>;
const post = async (r: APIRequestContext, url: string, data: unknown) => { const x = await r.post(url, { data, timeout: 120_000 }); return { s: x.status(), d: await json(x) }; };
const ctx = async (playwright: { request: { newContext: (o: { baseURL?: string }) => Promise<APIRequestContext> } }, username: string) => { const r = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL }); await signIn(r, username); return r; };

test("FDP: a 3-day training with per-day times and TA/DA saves, the HOD approves the nomination, and the on-duty letter prints", async ({ playwright }) => {
  const db = await testDb();
  const lead = await ctx(playwright, "dream.lead.cs");
  expect((await post(lead, "/api/fdp", { action: "session", title: "E2E three-day OBE training", kind: "TRAINING", date: "2026-11-10", hours: 6 })).s).toBe(200);
  const head = await db.user.findUniqueOrThrow({ where: { username: "dream.head" } });
  const s = await any(db).fdpSession.findFirst({ where: { chairmanId: head.id, title: "E2E three-day OBE training" }, orderBy: { createdAt: "desc" } });
  const plan = await post(lead, "/api/fdp/plan", { action: "plan", sessionId: s.id, startDate: "2026-11-10", endDate: "2026-11-12", same: false, start: "09:00", end: "13:00", days: [{ date: "2026-11-11", start: "09:00", end: "16:00" }], tada: "Rs 5,000", transport: "University bus", onDuty: true });
  expect(plan.s, JSON.stringify(plan.d)).toBe(200);
  expect(plan.d.days).toBe(3); expect(plan.d.hours).toBe(15);
  expect((await any(db).fdpSession.findUnique({ where: { id: s.id } })).hours).toBe(15);
  const ins = await db.user.findUniqueOrThrow({ where: { username: "dream.instructor" } });
  expect((await post(lead, "/api/fdp/plan", { action: "nominate", sessionId: s.id, userIds: [ins.id] })).s).toBe(200);
  const nom = await any(db).fdpNomination.findFirst({ where: { sessionId: s.id, userId: ins.id } });
  // Not the HOD → refused; the HOD → approved.
  expect((await post(lead, "/api/fdp/plan", { action: "decide", id: nom.id, approve: true })).s).toBe(400);
  const hod = await ctx(playwright, "dream.hod.cs");
  expect((await post(hod, "/api/fdp/plan", { action: "decide", id: nom.id, approve: true })).s).toBe(200);
  // The teacher prints the on-duty letter.
  const t = await ctx(playwright, "dream.instructor");
  const letter = await t.get(`/api/fdp/plan?letter=1&sessionId=${s.id}&userId=${ins.id}`);
  expect(letter.status()).toBe(200);
  expect(letter.headers()["content-type"]).toContain("application/pdf");
  expect((await letter.body()).subarray(0, 4).toString()).toBe("%PDF");
  // Attendance per day feeds the FDP hours (certificate number).
  expect((await post(lead, "/api/fdp/plan", { action: "day", sessionId: s.id, date: "2026-11-10", userIds: [ins.id] })).s).toBe(200);
  expect(await any(db).fdpAttendance.count({ where: { sessionId: s.id, userId: ins.id } })).toBe(1);
  for (const c of [lead, hod, t]) await c.dispose();
});

test("AI check: a sample question with a mocked model, the cost logged, refused when the month's budget is used up; plan review", async ({ playwright }) => {
  const db = await testDb();
  const head = await db.user.findUniqueOrThrow({ where: { username: "dream.head" } });
  const su = await ctx(playwright, "e2e.super");
  expect((await post(su, "/api/admin/ai-usage", { chairmanId: head.id, monthlyBudgetUsd: 5, paperModel: "mock", planModel: "mock" })).s).toBe(200);
  await any(db).aiUsage.deleteMany({ where: { chairmanId: head.id } });
  const ins = await db.user.findUniqueOrThrow({ where: { username: "dream.instructor" } });
  // The teacher's own Final question plan; one question is added when the course has none yet (removed at the end).
  const course = await db.course.findFirstOrThrow({ where: { instructorId: ins.id, isOffered: true, clos: { some: {} } }, include: { clos: { orderBy: { code: "asc" }, take: 1 } } });
  let items = await db.paperDistributionItem.findMany({ where: { courseId: course.id, source: "INSTRUCTOR", examType: "Final" }, orderBy: { questionNo: "asc" } });
  const added: string[] = [];
  if (!items.length) {
    const it = await db.paperDistributionItem.create({ data: { courseId: course.id, source: "INSTRUCTOR", examType: "Final", questionNo: 1, topicText: "Stacks and queues", cloId: course.clos[0].id, cognitiveLevel: "C2", marks: 10 } });
    added.push(it.id); items = [it];
  }
  const t = await ctx(playwright, "dream.instructor");
  await post(t, "/api/paper-vetting", { courseId: course.id, examType: "Final", action: "reopen" });
  const qs = { [items[0].id]: "Explain, with an example, how a stack differs from a queue." };
  const r = await post(t, "/api/paper-vetting", { courseId: course.id, examType: "Final", action: "check", ai: true, questions: qs });
  expect(r.s, JSON.stringify(r.d)).toBe(200);
  expect(r.d.aiError || "").toBe("");
  const v = await any(db).paperVetting.findUnique({ where: { courseId_examType: { courseId: course.id, examType: "Final" } } });
  const ai = JSON.parse(v.aiJson);
  expect(ai.questions[0].fitsClo).toBe(true); expect(ai.paper.difficulty).toBeTruthy();
  const used = await any(db).aiUsage.findFirst({ where: { chairmanId: head.id, kind: "PAPER", cached: false } });
  expect(used.costUsd).toBeGreaterThan(0); expect(used.inputTokens).toBe(1200);
  // The same version again: from the cache, no new cost.
  await post(t, "/api/paper-vetting", { courseId: course.id, examType: "Final", action: "check", ai: true, questions: qs });
  expect(await any(db).aiUsage.count({ where: { chairmanId: head.id, kind: "PAPER", cached: true } })).toBeGreaterThan(0);
  // The month's budget used up: a new version is refused.
  expect((await post(su, "/api/admin/ai-usage", { chairmanId: head.id, monthlyBudgetUsd: 0.000001, paperModel: "mock", planModel: "mock" })).s).toBe(200);
  const refused = await post(t, "/api/paper-vetting", { courseId: course.id, examType: "Final", action: "check", ai: true, questions: { [items[0].id]: "A different wording of the question." } });
  expect(String(refused.d.aiError)).toMatch(/budget/i);
  // The SE's plan review (mocked).
  expect((await post(su, "/api/admin/ai-usage", { chairmanId: head.id, monthlyBudgetUsd: 5, paperModel: "mock", planModel: "mock" })).s).toBe(200);
  const se = await ctx(playwright, "dream.se");
  const seCourse = await db.course.findFirstOrThrow({ where: { subjectExpert: { username: "dream.se" }, lectureRows: { some: { source: "SE" } } } });
  const pr = await post(se, "/api/ai-review", { courseId: seCourse.id });
  expect(pr.s, JSON.stringify(pr.d)).toBe(200);
  expect(pr.d.score).toBe(82); expect(pr.d.checks.length).toBe(6);
  if (added.length) { await any(db).paperVetting.deleteMany({ where: { courseId: course.id, examType: "Final" } }); await db.paperDistributionItem.deleteMany({ where: { id: { in: added } } }); }
  for (const c of [su, t, se]) await c.dispose();
});

test("visiting pay: faculty type required; 10:50 for a 10:00 class is late; pay = hours × rate − deductions − tax; HOD approves; Paid shows to the teacher", async ({ playwright, browser }) => {
  const db = await testDb();
  const lead = await ctx(playwright, "dream.lead.cs");
  const stamp = Date.now().toString(36);
  const noType = await post(lead, "/api/coordinator/faculty", { username: `e2e.vt.${stamp}`, password: "Temp#Pass1234", name: "E2E Visiting", email: `e2e.vt.${stamp}@e2e.test`, role: "INSTRUCTOR" });
  expect(noType.s).toBe(400); expect(String(noType.d.error)).toMatch(/faculty type/i);
  const ok = await post(lead, "/api/coordinator/faculty", { username: `e2e.vt.${stamp}`, password: "Temp#Pass1234", name: "E2E Visiting", email: `e2e.vt.${stamp}@e2e.test`, role: "INSTRUCTOR", facultyType: "Visiting" });
  expect(ok.s, JSON.stringify(ok.d)).toBe(201);
  expect((await db.facultyProfile.findUniqueOrThrow({ where: { userId: ok.d.user.id } })).employmentType).toBe("Visiting");

  // A vetted claim of dream.instructor: one 90-minute class at 10:00, biometric in at 10:50.
  const head = await db.user.findUniqueOrThrow({ where: { username: "dream.head" } });
  const ins = await db.user.findUniqueOrThrow({ where: { username: "dream.instructor" } });
  const course = await db.course.findFirstOrThrow({ where: { instructorId: ins.id, isOffered: true } });
  const dean = await ctx(playwright, "dream.head");
  expect((await post(dean, "/api/visiting-pay", { action: "rule", basis: "LECTURE", rateTheory: 1000, rateLab: 1000, period: "MONTHLY", lateGraceMin: 10, latePenaltyPct: 50, phdBonusPct: 0, marksWithinDays: 14 })).s).toBe(200);
  expect((await post(dean, "/api/visiting-pay", { action: "setting", lateMode: "PCT", lateFixed: 0, lateEveryN: 3, periodWeeks: 4, taxMode: "PCT", filerPct: 10, nonFilerPct: 20, slabs: "" })).s).toBe(200);
  expect((await post(dean, "/api/visiting-pay", { action: "profile", userId: ins.id, category: "Lecturer", ratePerHour: 1000, filer: true })).s).toBe(200);
  const aId = `e2e-a-${stamp}`, cId = `e2e-c-${stamp}`;
  const from = new Date(Date.UTC(2026, 9, 1)), to = new Date(Date.UTC(2026, 9, 31, 23, 59));
  await any(db).visitingAssignment.create({ data: { id: aId, chairmanId: head.id, courseId: course.id, userId: ins.id, active: true } });
  await any(db).visitingClaim.create({ data: { id: cId, chairmanId: head.id, assignmentId: aId, courseId: course.id, userId: ins.id, periodStart: from, periodEnd: to, status: "PL_FORWARDED", amount: 1000, linesJson: JSON.stringify([{ lectureNumber: 1, date: "2026-10-05", start: "10:00", end: "11:30", minutes: 90, mode: "ON_CAMPUS", topic: "Intro", attendance: true, inAt: "10:50", outAt: "11:30", flag: "Arrived 10:50 (lecture 10:00)", counted: true, reason: null }]), requirementsJson: "[]" } });
  const sh = await post(dean, "/api/visiting-pay", { action: "sheet", userId: ins.id, at: "2026-10-15" });
  expect(sh.s, JSON.stringify(sh.d)).toBe(200);
  // 1.5 h × Rs 1000 = 1500; late (50% of the class) − 750; tax 10% of 750 = 75; net 675.
  expect(sh.d.sheet.gross).toBe(1500); expect(sh.d.sheet.deductions).toBe(750); expect(sh.d.sheet.tax).toBe(75); expect(sh.d.sheet.net).toBe(675); expect(sh.d.sheet.lates).toBe(1);
  // The HOD approves, Accounts (here the Institute Head) marks it paid.
  const hod = await ctx(playwright, "dream.hod.cs");
  expect((await post(hod, "/api/visiting-pay", { action: "hod", id: sh.d.sheet.id })).s).toBe(200);
  expect((await post(dean, "/api/visiting-pay", { action: "sheetPaid", id: sh.d.sheet.id, ref: "CHQ-1001", date: "2026-11-01" })).s).toBe(200);
  const tctx = await browser.newContext();
  await signIn(tctx, "dream.instructor");
  const page = await tctx.newPage();
  await page.goto("/visiting-pay");
  await expect(page.locator(`[data-sheet="${sh.d.sheet.id}"] [data-sheet-status]`)).toContainText("Paid 2026-11-01 (CHQ-1001)");
  expect((await tctx.request.get(`/api/visiting-pay?sheetPdf=${sh.d.sheet.id}`)).status()).toBe(200);
  // Clean up the test claim's pay records.
  await any(db).visitingPaySheet.deleteMany({ where: { id: sh.d.sheet.id } });
  await any(db).visitingClaim.deleteMany({ where: { id: cId } }); await any(db).visitingAssignment.deleteMany({ where: { id: aId } });
  await tctx.close(); for (const c of [lead, dean, hod]) await c.dispose();
});
