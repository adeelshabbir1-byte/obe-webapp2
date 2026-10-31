import { test, expect, type Browser, type BrowserContext } from "@playwright/test";
import { BROKEN, json, signIn, testDb } from "./helpers";

// Collaborative question bank and peer-reviewed exam papers for a shared course (CC-212, taught by dream.t5 and
// dream.t9): mandatory metadata and the duplicate check, drafts against the blueprint, 5-star ratings, the consensus
// paper with a tie the Course Lead breaks, and the published official paper in every section with its CLO mapping.
test.describe.configure({ mode: "serial" });
const as = async (browser: Browser, u: string) => { const c = await browser.newContext(); await signIn(c, u); return c; };
const API = "/api/exam-board";
const run = String(Date.now()).slice(-6);
let team = "", leadCourse = "", otherCourse = "";
let lec: Record<string, number> = {};
const ids: Record<string, string> = {};

async function add(c: BrowserContext, key: string, clo: string, difficulty: string, text: string, extra: Record<string, unknown> = {}) {
  const r = await json(await c.request.post(API, { data: { action: "addQuestion", team, text: `${text} (${run})`, marks: 4, kind: "SHORT", bloom: "C3", difficulty, cloCodes: [clo], lectureNumber: lec[clo], rubric: "Model answer and marking scheme.", ...extra } }));
  expect(r.id, JSON.stringify(r)).toBeTruthy();
  ids[key] = r.id;
}

test.beforeAll(async () => {
  const db = await testDb();
  const cs = await db.course.findMany({ where: { code: "CC-212", isOffered: true, instructor: { username: { in: ["dream.t5", "dream.t9"] } } }, select: { id: true, offeredTermName: true, offeredTermYear: true, instructor: { select: { username: true } }, equivalenceMember: { select: { groupId: true } } } });
  leadCourse = cs.find((c) => c.instructor?.username === "dream.t5")!.id;
  otherCourse = cs.find((c) => c.instructor?.username === "dream.t9")!.id;
  const c0 = cs[0];
  team = `${c0.equivalenceMember ? `g:${c0.equivalenceMember.groupId}` : "c:cc-212"}|${`${c0.offeredTermName || ""} ${c0.offeredTermYear || ""}`.trim()}`;
  const rows = await db.lectureRow.findMany({ where: { courseId: leadCourse, source: "INSTRUCTOR", cloId: { not: null } }, orderBy: { lectureNumber: "asc" }, select: { lectureNumber: true, clo: { select: { code: true } } } });
  for (const r of rows) if (r.clo && !(r.clo.code in lec)) lec[r.clo.code] = r.lectureNumber;
  lec = { ...lec };
});

test("Course Lead named; questions need their metadata; near-duplicates are caught", async ({ browser }) => {
  const db = await testDb();
  const head = await as(browser, "dream.head");
  const t5u = await db.user.findFirstOrThrow({ where: { username: "dream.t5" }, select: { id: true } });
  expect((await head.request.post("/api/course-leads", { data: { teamKey: team, leadId: t5u.id } })).ok()).toBeTruthy();
  const t5 = await as(browser, "dream.t5");
  // Mandatory metadata.
  const base = { action: "addQuestion", team, text: `Explain encapsulation with an example (${run}).`, marks: 4, kind: "SHORT", bloom: "C3", difficulty: "EASY", cloCodes: ["CLO-1"], lectureNumber: lec["CLO-1"], rubric: "Hiding state behind methods." };
  expect((await json(await t5.request.post(API, { data: { ...base, lectureNumber: 999 } }))).error).toMatch(/topic of the lecture plan/);
  expect((await json(await t5.request.post(API, { data: { ...base, cloCodes: [] } }))).error).toMatch(/at least one CLO/);
  expect((await json(await t5.request.post(API, { data: { ...base, difficulty: "" } }))).error).toMatch(/Easy, Medium or Hard/);
  expect((await json(await t5.request.post(API, { data: { ...base, rubric: "" } }))).error).toMatch(/rubric/);
  expect((await json(await t5.request.post(API, { data: { ...base, kind: "MCQ", options: ["Only one"] } }))).error).toMatch(/two options/);
  // t5's five questions.
  await add(t5, "A1", "CLO-1", "EASY", "Explain encapsulation in object-oriented programming with an example of a bank account class");
  await add(t5, "A2", "CLO-2", "MEDIUM", "Design a class hierarchy for shapes and implement area calculation using overriding");
  await add(t5, "A3", "CLO-3", "MEDIUM", "Analyse the following code and identify every violation of the open-closed principle", { kind: "CODE", codeSnippet: "class Report { print() {} save() {} }" });
  await add(t5, "A4", "CLO-4", "MEDIUM", "Evaluate composition against inheritance for a payroll system and justify your choice");
  await add(t5, "A5", "CLO-1", "HARD", "Describe polymorphism and dynamic dispatch with a virtual table diagram of three classes");
  // The other teacher writes nearly the same as A1: warned, the similar question returned.
  const t9 = await as(browser, "dream.t9");
  const dup = await json(await t9.request.post(API, { data: { ...base, text: `With an example of a bank account class, explain encapsulation in object oriented programming (${run})` } }));
  expect(dup.duplicates?.[0]?.id).toBe(ids.A1);
  await add(t9, "B1", "CLO-1", "EASY", "List the access specifiers of a class and state what each one allows outside the class");
  await add(t9, "B2", "CLO-2", "MEDIUM", "Implement a stack class with push and pop and overload the output operator for it");
  await add(t9, "B3", "CLO-3", "MEDIUM", "Analyse a vending machine design and refactor it with the strategy pattern");
  await add(t9, "B4", "CLO-4", "MEDIUM", "Critically assess the use of multiple inheritance in a university records system");
  await add(t9, "B5", "CLO-1", "HARD", "Trace object construction and destruction order in a three level inheritance chain");
  const page = await t5.newPage();
  await page.goto(`/exam-board?team=${encodeURIComponent(team)}&exam=Final&tab=bank`);
  await expect(page.locator("body")).not.toContainText(BROKEN);
  await expect(page.locator(`[data-bank="${ids.A3}"]`)).toContainText("class Report");
});

test("drafts must meet the blueprint; peers rate each other's questions 1–5 stars", async ({ browser }) => {
  const t5 = await as(browser, "dream.t5"), t9 = await as(browser, "dream.t9");
  const draft = (c: BrowserContext, k: string[]) => c.request.post(API, { data: { action: "saveDraft", team, exam: "Final", itemIds: k.map((x) => ids[x]) } }).then(json);
  // Too hard and CLO-1 heavy: refused on submit.
  const bad = await draft(t5, ["A1", "A5"]);
  expect(bad.check.ok).toBe(false);
  expect((await json(await t5.request.post(API, { data: { action: "submitDraft", team, exam: "Final" } }))).error).toMatch(/blueprint/);
  expect((await draft(t5, ["A1", "A2", "A3", "A4", "A5"])).check.ok).toBe(true);
  expect((await t5.request.post(API, { data: { action: "submitDraft", team, exam: "Final" } })).ok()).toBeTruthy();
  expect((await draft(t9, ["B1", "B2", "B3", "B4", "B5"])).check.ok).toBe(true);
  expect((await t9.request.post(API, { data: { action: "submitDraft", team, exam: "Final" } })).ok()).toBeTruthy();
  const rate = (c: BrowserContext, k: string, stars: number, comment = "") => c.request.post(API, { data: { action: "rate", team, exam: "Final", itemId: ids[k], stars, comment } }).then(json);
  expect((await rate(t5, "A1", 5)).error).toMatch(/your own question/);
  expect((await rate(t9, "A2", 1)).error).toMatch(/need a reason/);
  // CLO-1: A1 5, A5 4, B1 3, B5 2 · CLO-2: A2 4 = B2 4 (a tie) · CLO-3: B3 5 > A3 3 · CLO-4: A4 4 > B4 3.
  for (const [k, s] of [["A1", 5], ["A5", 4], ["A2", 4], ["A3", 3], ["A4", 4]] as const) expect((await rate(t9, k, s)).ok).toBe(true);
  for (const [k, s, c] of [["B1", 3, ""], ["B5", 2, "Off the CLO's level"], ["B3", 5, ""], ["B4", 3, ""]] as const) expect((await rate(t5, k, s, c)).ok).toBe(true);
  // One rating through the page: four stars on B2.
  const page = await t5.newPage();
  await page.goto(`/exam-board?team=${encodeURIComponent(team)}&exam=Final&tab=review`);
  await expect(page.locator("body")).not.toContainText(BROKEN);
  await page.locator(`[data-stars="${ids.B2}"]`).getByRole("button", { name: "4 stars" }).click();
  await expect(page.locator(`[data-avg="${ids.B2}"]`)).toHaveText("4.00 ★");
  await expect(page.locator(`[data-avg="${ids.B5}"]`)).toHaveText("2.00 ★");
});

test("consensus: highest rated per slot, the tie goes to the Course Lead, who publishes the official paper", async ({ browser }) => {
  const db = await testDb();
  const t5 = await as(browser, "dream.t5"), t9 = await as(browser, "dream.t9");
  const page = await t5.newPage();
  await page.goto(`/exam-board?team=${encodeURIComponent(team)}&exam=Final&tab=consensus`);
  await expect(page.locator("body")).not.toContainText(BROKEN);
  await expect(page.locator('[data-slot="CLO-1#1"]')).toContainText("encapsulation");
  await expect(page.locator('[data-slot="CLO-2#1"]')).toHaveAttribute("data-status", "TIE");
  await expect(page.locator('[data-slot="CLO-3#1"]')).toContainText("vending machine");
  const lead = (c: BrowserContext, b: Record<string, unknown>) => c.request.post(API, { data: { action: "lead", team, exam: "Final", ...b } }).then(json);
  expect((await lead(t5, { op: "publish" })).error).toMatch(/CLO-2#1 \(tie\)/);
  expect((await lead(t9, { op: "pick", slot: "CLO-2#1", itemId: ids.B2 })).error).toMatch(/Only the Course Lead/);
  expect((await lead(t5, { op: "pick", slot: "CLO-3#1", itemId: ids.A3 })).error).toMatch(/overriding/);
  expect((await lead(t5, { op: "pick", slot: "CLO-2#1", itemId: ids.B2 })).ok).toBe(true);
  expect((await lead(t5, { op: "edit", itemId: ids.A4, text: `Evaluate composition against inheritance for a payroll system; justify your choice with two criteria (${run})`, marks: 4 })).ok).toBe(true);
  const pub = await lead(t5, { op: "publish" });
  expect(pub.ok, pub.error).toBe(true);
  // Locked; both sections have the official paper in their question plan, the texts in their paper vetting.
  expect((await t9.request.post(API, { data: { action: "rate", team, exam: "Final", itemId: ids.A1, stars: 3 } }).then(json)).error).toMatch(/published and locked/);
  for (const c of [leadCourse, otherCourse]) {
    const items = await db.paperDistributionItem.findMany({ where: { courseId: c, source: "INSTRUCTOR", examType: "Final" }, include: { clo: { select: { code: true } } }, orderBy: { orderIndex: "asc" } });
    expect(items.map((i) => i.clo?.code)).toEqual(["CLO-1", "CLO-1", "CLO-2", "CLO-3", "CLO-4"]);
  }
  const v = await db.paperVetting.findUniqueOrThrow({ where: { courseId_examType: { courseId: otherCourse, examType: "Final" } } });
  expect(v.questionsJson).toContain("two criteria");
  const audit = await db.auditLog.findMany({ where: { action: { in: ["EXAM_TIE_BROKEN", "EXAM_LEAD_EDITED", "EXAM_PUBLISHED", "QB_QUESTION_RATED", "QB_QUESTION_ADDED"] }, createdAt: { gte: new Date(Date.now() - 3600_000) } }, select: { action: true } });
  for (const a of ["EXAM_TIE_BROKEN", "EXAM_LEAD_EDITED", "EXAM_PUBLISHED", "QB_QUESTION_RATED", "QB_QUESTION_ADDED"]) expect(audit.some((x) => x.action === a), a).toBe(true);
  await page.goto(`/exam-board?team=${encodeURIComponent(team)}&exam=Final&tab=paper`);
  await expect(page.getByTestId("official-paper")).toContainText("two criteria");
  await expect(page.locator("[data-paper-q]")).toHaveCount(5);
  await expect(page.locator('[data-clo-row="CLO-1"]')).toContainText("40%");
  // Every tab opens for the other teacher and for the HOD (read-only).
  for (const u of ["dream.t9", "dream.hod.cs"]) {
    const p = await (await as(browser, u)).newPage();
    for (const tab of ["bank", "draft", "review", "consensus", "paper"]) {
      await p.goto(`/exam-board?team=${encodeURIComponent(team)}&exam=Final&tab=${tab}`);
      await expect(p.locator("body")).not.toContainText(BROKEN);
    }
  }
});
