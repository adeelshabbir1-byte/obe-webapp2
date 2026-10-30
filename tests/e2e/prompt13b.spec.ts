import { test, expect, type Browser } from "@playwright/test";
import { BROKEN, json, signIn, testDb } from "./helpers";

// Golden Copy guardrails and hybrid synthesis: an institute's copy of an HEC curriculum can't change locked fields, shows
// its compliance meter; teachers submit parallel proposals; the synthesizer checks every pick (guardrails included).
test.describe.configure({ mode: "serial" });
const as = async (browser: Browser, u: string) => { const c = await browser.newContext(); await signIn(c, u); return c; };
const run = String(Date.now()).slice(-6);
let officialId = "", copyId = "";

test("an institute copy of a Golden Copy: meter shown, locked fields refused", async ({ browser }) => {
  const db = await testDb();
  const su = await as(browser, "e2e.super");
  officialId = (await json(await su.request.post("/api/curriculum-builder", { data: { action: "start", program: "BS Computer Science", council: "HEC", version: `G-${run}`, templateKey: "HEC-BS-CS-2025" } }))).id;
  // Test set-up only: mark it published (the stage-gates are covered by prompt13a).
  await db.masterCurriculum.update({ where: { id: officialId }, data: { status: "PUBLISHED" } });
  const head = await as(browser, "dream.head");
  const r = await json(await head.request.post("/api/curriculum-builder", { data: { action: "start", program: "BS Computer Science", council: "HEC", version: `G-${run}`, sourceId: officialId } }));
  copyId = r.id;
  expect(copyId, r.error).toBeTruthy();
  expect((await db.masterCurriculum.findUniqueOrThrow({ where: { id: copyId } })).parentCurriculumId).toBe(officialId);
  const page = await head.newPage();
  await page.goto(`/curricula/${copyId}`);
  await expect(page.locator("body")).not.toContainText(BROKEN);
  await expect(page.getByTestId("golden-meter")).toContainText("HEC Golden Copy compliance");
  // The OMC can't change a Golden Copy course's credit hours, code or title, nor delete it.
  const course = await db.masterCourse.findFirstOrThrow({ where: { masterCurriculumId: copyId, title: "Programming Fundamentals" }, select: { id: true, code: true, creditHours: true } });
  const omc = await as(browser, "dream.omc");
  const ch = await omc.request.put(`/api/omc/master-curriculum/courses/${course.id}`, { data: { creditHours: course.creditHours + 1 } });
  expect(ch.status()).toBe(423);
  expect((await json(ch)).error).toMatch(/credit hours .* set by HEC/);
  expect((await omc.request.put(`/api/omc/master-curriculum/courses/${course.id}`, { data: { code: "XX-999" } })).status()).toBe(423);
  expect((await omc.request.delete(`/api/omc/master-curriculum/courses/${course.id}`)).status()).toBe(423);
  // Unlocked: local books.
  expect((await omc.request.put(`/api/omc/master-curriculum/courses/${course.id}`, { data: { textbook: "Our own lab manual and text" } })).ok()).toBeTruthy();
  expect((await db.masterCourse.findUniqueOrThrow({ where: { id: course.id } })).creditHours).toBe(course.creditHours);
});

test("parallel proposals and the synthesizer: every pick is checked, guardrails included", async ({ browser }) => {
  const db = await testDb();
  const course = await db.masterCourse.findFirstOrThrow({ where: { masterCurriculumId: copyId, title: "Programming Fundamentals" }, select: { id: true } });
  const golden = await db.masterCourse.findFirstOrThrow({ where: { masterCurriculumId: officialId, title: "Programming Fundamentals" }, select: { seedClos: { orderBy: { orderIndex: "asc" }, select: { statement: true, bloomLevel: true } }, seedTopics: { orderBy: { lectureNumber: "asc" }, select: { topic: true, cloNumber: true } } } });
  const se = await as(browser, "dream.se"), t = await as(browser, "dream.instructor");
  const full = { description: "Problem solving and programming in C++.", clos: golden.seedClos.map((c) => `${c.statement} | ${c.bloomLevel}`).join("\n"), topics: golden.seedTopics.map((x) => `${x.topic} | ${x.cloNumber ?? 1}`).join("\n"), assessments: "Quiz 10\nAssignment 10\nMid 30\nFinal 50", books: "Deitel, C++ How to Program" };
  expect((await json(await se.request.post("/api/synthesis", { data: { action: "propose", masterCourseId: course.id, ...full, note: "Keeps HEC content" } }))).id).toBeTruthy();
  const changed = { ...full, topics: golden.seedTopics.map((x, i) => `${i >= 8 && i < 16 ? `Local module ${i}` : x.topic} | ${x.cloNumber ?? 1}`).join("\n"), books: "Gaddis, Starting Out with C++" };
  expect((await json(await t.request.post("/api/synthesis", { data: { action: "propose", masterCourseId: course.id, ...changed } }))).id).toBeTruthy();
  const [a, b] = await db.courseProposal.findMany({ where: { masterCourseId: course.id }, orderBy: { createdAt: "asc" } });
  const pl = await as(browser, "dream.lead.cs");
  const pv = (picks: object) => pl.request.post("/api/synthesis", { data: { action: "preview", masterCourseId: course.id, picks } }).then(json);
  const good = await pv({ base: a.id, modules: [a.id, a.id, a.id, a.id], lab: a.id, assessments: a.id, books: b.id });
  expect(good.checks.issues.filter((i: string) => /HEC guardrail/.test(i))).toEqual([]);
  expect(good.result.books[0].title).toBe("Gaddis, Starting Out with C++");
  const bad = await pv({ base: a.id, modules: [a.id, b.id, a.id, a.id], lab: a.id, assessments: a.id, books: a.id });
  expect(bad.checks.issues.some((i: string) => /HEC guardrail: .* core topic/.test(i))).toBe(true);
  expect((await json(await pl.request.post("/api/synthesis", { data: { action: "apply", masterCourseId: course.id, picks: { base: a.id, modules: [a.id, b.id, a.id, a.id], lab: a.id, assessments: a.id, books: a.id } } }))).error).toMatch(/Not compliant yet/);
  const page = await pl.newPage();
  await page.goto(`/curricula/${copyId}/synthesis?course=${course.id}`);
  await expect(page.locator("body")).not.toContainText(BROKEN);
  await expect(page.locator("[data-proposal]")).toHaveCount(2);
  await expect(page.getByTestId("synthesis-checks")).toBeVisible();
});
