import { test, expect, type Browser } from "@playwright/test";
import { BROKEN, json, signIn, testDb } from "./helpers";

// CLO attainment methods: OMC settings and comparison; mapping rules; absent vs zero; early warning → CQI action;
// faulty item left out of the grade re-opens the result; the Program Lead's own deadline setting (logged).
test.describe.configure({ mode: "serial" });
const as = async (browser: Browser, u: string) => { const c = await browser.newContext(); await signIn(c, u); return c; };
const API = "/api/clo-method";

test("OMC: method settings, four-method comparison, assessment types", async ({ browser }) => {
  const db = await testDb();
  const omc = await as(browser, "dream.omc");
  const page = await omc.newPage();
  await page.goto("/omc/clo-attainment");
  await expect(page.locator("body")).not.toContainText(BROKEN);
  await expect(page.getByText("Grade weights (default)")).toBeVisible();
  // Give one program its own method, then put it back.
  expect((await omc.request.post(API, { data: { action: "settings", program: "BS Computer Science", method: "SUM", passPct: 50, itemsPct: 50, targetPct: 60, excellent: 80, good: 60, satisfactory: 50 } })).ok()).toBeTruthy();
  await page.goto("/omc/clo-attainment?tab=method&program=BS%20Computer%20Science");
  await expect(page.getByText(/This program has its own settings/)).toBeVisible();
  expect((await omc.request.post(API, { data: { action: "settings", program: "BS Computer Science", method: "GRADE" } })).ok()).toBeTruthy();
  // Not an OMC member: refused.
  const t = await as(browser, "dream.instructor");
  expect((await t.request.post(API, { data: { action: "settings", program: "", method: "SUM" } })).status()).toBe(400);
  const course = await db.course.findFirstOrThrow({ where: { code: "MS-151", instructor: { username: "dream.instructor" } }, select: { id: true } });
  await page.goto(`/omc/clo-attainment?tab=compare&course=${course.id}`);
  for (const h of ["1. Add all marks", "2. Pass at least half the items", "3. OMC / SE weights", "4. Grade weights"]) await expect(page.getByRole("columnheader", { name: h })).toBeVisible();
  await page.goto("/omc/clo-attainment?tab=types");
  await expect(page.getByRole("cell", { name: "Class participation" })).toBeVisible();
  await expect(page.getByText("never (not graded)").first()).toBeVisible();
});

test("mapping: split 60/40 saves; a question can't be Not for CLO; splits must add to 100", async ({ browser }) => {
  const db = await testDb();
  const course = await db.course.findFirstOrThrow({ where: { code: "CC-311", instructor: { username: "dream.instructor" } }, select: { id: true } });
  const [q1, quiz] = await Promise.all([
    db.assessmentInstrument.findFirstOrThrow({ where: { courseId: course.id, source: "INSTRUCTOR", label: "Final Q1" } }),
    db.assessmentInstrument.findFirstOrThrow({ where: { courseId: course.id, source: "INSTRUCTOR", label: "Quiz 4" } }),
  ]);
  const clos = await db.cLO.findMany({ where: { courseId: course.id, source: "INSTRUCTOR" }, orderBy: { code: "asc" }, take: 2 });
  const t = await as(browser, "dream.instructor");
  const ok = await t.request.post(API, { data: { action: "item", courseId: course.id, source: "INSTRUCTOR", instrumentId: q1.id, splits: [{ cloId: clos[0].id, pct: 60 }, { cloId: clos[1].id, pct: 40 }] } });
  expect(ok.ok()).toBeTruthy();
  const bad = await t.request.post(API, { data: { action: "item", courseId: course.id, source: "INSTRUCTOR", instrumentId: q1.id, splits: [{ cloId: clos[0].id, pct: 70 }, { cloId: clos[1].id, pct: 40 }] } });
  expect((await json(bad)).error).toMatch(/adds up to 110%/);
  const nfc = await t.request.post(API, { data: { action: "item", courseId: course.id, source: "INSTRUCTOR", instrumentId: q1.id, notForClo: true, notForCloReason: "x" } });
  expect((await json(nfc)).error).toMatch(/must map to a CLO/);
  expect((await t.request.post(API, { data: { action: "item", courseId: course.id, source: "INSTRUCTOR", instrumentId: quiz.id, notForClo: true, notForCloReason: "Bonus quiz" } })).ok()).toBeTruthy();
  const page = await t.newPage();
  await page.goto(`/courses/${course.id}/clo-attainment?source=INSTRUCTOR`);
  await expect(page.locator("body")).not.toContainText(BROKEN);
  await expect(page.getByRole("heading", { name: "Results per CLO" })).toBeVisible();
  await expect(page.locator("tr[data-item='Final Q1']")).toContainText(`${clos[0].code} 60% + ${clos[1].code} 40%`);
  await expect(page.locator("tr[data-item='Quiz 4']")).toContainText("Not for CLO — Bonus quiz");
});

test("absent vs zero; an item most students fail raises a red warning; a CQI action is recorded", async ({ browser }) => {
  const db = await testDb();
  const course = await db.course.findFirstOrThrow({ where: { code: "CC-311", instructor: { username: "dream.instructor" } }, select: { id: true, instructorId: true } });
  const t = await as(browser, "dream.instructor");
  const marked = await db.studentMark.findFirstOrThrow({ where: { courseId: course.id, instrument: { label: "Quiz 1" } } });
  // A blank cell removes the mark (absent), never saves 0.
  const blank = await t.request.put(`/api/instructor/courses/${course.id}/marks`, { data: { studentId: marked.studentId, instrumentId: marked.instrumentId, score: "" } });
  expect((await json(blank)).absent).toBe(true);
  expect(await db.studentMark.count({ where: { id: marked.id } })).toBe(0);
  const zero = await t.request.put(`/api/instructor/courses/${course.id}/marks`, { data: { studentId: marked.studentId, instrumentId: marked.instrumentId, score: "0" } });
  expect((await json(zero)).mark.score).toBe(0);
  // Quiz 3: 20 of 30 students marked, 14 of them below 50% → red.
  const q3 = await db.assessmentInstrument.findFirstOrThrow({ where: { courseId: course.id, source: "INSTRUCTOR", label: "Quiz 3" } });
  const students = await db.studentEnrollment.findMany({ where: { courseId: course.id }, select: { studentId: true }, take: 20 });
  for (const [i, s] of students.entries()) expect((await t.request.put(`/api/instructor/courses/${course.id}/marks`, { data: { studentId: s.studentId, instrumentId: q3.id, score: String(i < 14 ? 2 : 8) } })).ok()).toBeTruthy();
  const w = await db.itemWarning.findUniqueOrThrow({ where: { instrumentId: q3.id } });
  expect(w.level).toBe("RED");
  expect(w.sat).toBe(20);
  expect(await db.notification.count({ where: { userId: course.instructorId!, kind: "EARLY_WARNING" } })).toBeGreaterThan(0);
  const page = await t.newPage();
  await page.goto(`/courses/${course.id}/clo-attainment#warnings`);
  await expect(page.locator("[data-warning=RED]")).toContainText("Quiz 3");
  const r = await json(await t.request.post(API, { data: { action: "respond", warningId: w.id, actions: ["TUTORIAL"], note: "Extra tutorial on Thursday" } }));
  const cqi = await db.cqiRecord.findUniqueOrThrow({ where: { id: r.cqiRecordId } });
  expect(cqi.actionTaken).toContain("Extra tutorial");
  expect(cqi.metricBefore).toBe(30);
});

test("the OMC marks an item faulty and leaves it out of the grade: approved result re-opened, shown on the CLO page", async ({ browser }) => {
  const db = await testDb();
  const course = await db.course.findFirstOrThrow({ where: { code: "MS-151", instructor: { username: "dream.instructor" } }, select: { id: true } });
  const item = await db.assessmentInstrument.findFirstOrThrow({ where: { courseId: course.id, source: "INSTRUCTOR", label: "Quiz 2" } });
  const omc = await as(browser, "dream.omc");
  expect((await omc.request.post(API, { data: { action: "faulty", instrumentId: item.id, faulty: true, reason: "Ambiguous question", noGrade: true } })).ok()).toBeTruthy();
  expect((await db.courseResult.findUniqueOrThrow({ where: { courseId: course.id } })).status).toBe("RETURNED");
  const t = await as(browser, "dream.instructor");
  const page = await t.newPage();
  await page.goto(`/courses/${course.id}/clo-attainment`);
  await expect(page.getByText("Quiz 2 — Faulty: Ambiguous question · also out of the grade")).toBeVisible();
  await page.goto("/omc/clo-attainment?tab=faulty");
});

test("Program Lead: his program's marks deadline overrides the department default, and the change is logged", async ({ browser }) => {
  const db = await testDb();
  const pl = await as(browser, "dream.lead.cs");
  expect((await pl.request.post(API, { data: { action: "warnProgram", program: "BS Computer Science", values: { marksDays: 7 } } })).ok()).toBeTruthy();
  const page = await pl.newPage();
  await page.goto("/omc/clo-attainment?tab=warnings");
  await expect(page.locator("body")).not.toContainText(BROKEN);
  await expect(page.getByRole("row", { name: /Marks due \(working days\) 5 7/ })).toBeVisible();
  expect(await db.settingChange.count({ where: { area: "WARN", field: "marksDays", newValue: "7" } })).toBeGreaterThan(0);
  expect((await pl.request.post(API, { data: { action: "warnProgram", program: "Not my program", values: { marksDays: 3 } } })).status()).toBe(400);
  expect((await pl.request.post(API, { data: { action: "warnProgram", program: "BS Computer Science", reset: true } })).ok()).toBeTruthy();
});
