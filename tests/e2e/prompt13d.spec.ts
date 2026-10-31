import { test, expect, type Browser } from "@playwright/test";
import { randomUUID } from "crypto";
import { BROKEN, json, signIn, testDb } from "./helpers";
import { taskDef } from "../../lib/accreditation/catalogue";

// The rest of the national curriculum spec: the curriculum builder can't change a Golden Copy course either; a program
// whose copy is red (or yellow without a justification) can't be submitted for accreditation; CQI flags show on the
// stage-gates page and can be marked resolved.
test.describe.configure({ mode: "serial" });
const as = async (browser: Browser, u: string) => { const c = await browser.newContext(); await signIn(c, u); return c; };
const run = String(Date.now()).slice(-6);
const program = `BS Computer Science E2E-${run}`;
let copyId = "";

test("the curriculum builder can't change or remove a Golden Copy course", async ({ browser }) => {
  const db = await testDb();
  const su = await as(browser, "e2e.super");
  const officialId = (await json(await su.request.post("/api/curriculum-builder", { data: { action: "start", program: "BS Computer Science", council: "HEC", version: `D-${run}`, templateKey: "HEC-BS-CS-2025" } }))).id;
  // Test set-up only: mark it published (the stage-gates are covered by prompt13a).
  await db.masterCurriculum.update({ where: { id: officialId }, data: { status: "PUBLISHED" } });
  const head = await as(browser, "dream.head");
  const r = await json(await head.request.post("/api/curriculum-builder", { data: { action: "start", program: "BS Computer Science", council: "HEC", version: `D-${run}`, sourceId: officialId } }));
  copyId = r.id;
  expect(copyId, r.error).toBeTruthy();
  // Its own program name, so the accreditation check below sees only this copy.
  await db.masterCurriculum.update({ where: { id: copyId }, data: { degreeProgram: program, title: program } });
  const pf = await db.masterCourse.findFirstOrThrow({ where: { masterCurriculumId: copyId, title: "Programming Fundamentals" } });
  const ch = await head.request.post("/api/curriculum-builder", { data: { id: copyId, action: "updateCourse", courseId: pf.id, creditHours: pf.creditHours + 1 } });
  expect(ch.status()).toBe(400);
  expect((await json(ch)).error).toMatch(/set by HEC/);
  expect((await json(await head.request.post("/api/curriculum-builder", { data: { id: copyId, action: "removeCourse", courseId: pf.id } }))).error).toMatch(/can't be removed/);
  expect((await db.masterCourse.findUniqueOrThrow({ where: { id: pf.id } })).creditHours).toBe(pf.creditHours);
});

test("accreditation: red is refused, yellow needs a justification, then it goes through", async ({ browser }) => {
  const db = await testDb();
  const head = await db.user.findFirstOrThrow({ where: { username: "dream.head" }, select: { id: true } });
  const lead = await db.user.findFirstOrThrow({ where: { username: "dream.lead.cs" }, select: { id: true } });
  const def = taskDef("NCEAC", "1.1")!;
  const cycle = await db.accreditationCycle.create({ data: { chairmanId: head.id, leadId: lead.id, program, body: "NCEAC", title: `NCEAC visit ${run}`, createdById: head.id } });
  const task = await db.accreditationTask.create({ data: { cycleId: cycle.id, code: "1.1", status: "ASSIGNED", assigneeId: lead.id, assignedById: head.id, assignedAt: new Date(), dataJson: JSON.stringify({ checked: Object.fromEntries(def.checklist.map((c) => [c, true])) }) } });
  const pl = await as(browser, "dream.lead.cs");
  const submit = () => pl.request.patch(`/api/accreditation/tasks/${task.id}`, { data: { action: "submit" } });
  // Red: most of the HEC courses renamed away (test set-up), then put back.
  const courses = await db.masterCourse.findMany({ where: { masterCurriculumId: copyId }, select: { id: true, code: true, title: true } });
  const some = courses.slice(0, Math.ceil(courses.length * 0.6));
  for (const c of some) await db.masterCourse.update({ where: { id: c.id }, data: { code: `X${c.code}`.slice(0, 20), title: `Local ${c.title}` } });
  const red = await submit();
  expect(red.status()).toBe(409);
  expect((await json(red)).error).toMatch(/red: core mandates missing/);
  for (const c of some) await db.masterCourse.update({ where: { id: c.id }, data: { code: c.code, title: c.title } });
  // Yellow: one local course added.
  await db.masterCourse.create({ data: { masterCurriculumId: copyId, code: `LOC-${run}`, title: "Regional Studies", creditHours: 2, category: "General Education" } });
  const yellow = await submit();
  expect(yellow.status()).toBe(409);
  expect((await json(yellow)).error).toMatch(/yellow\): give the justification/);
  const hc = await as(browser, "dream.head");
  expect((await hc.request.post("/api/synthesis", { data: { action: "justify", curriculumId: copyId, text: "Regional Studies is required by the provincial charter." } })).ok()).toBeTruthy();
  expect((await submit()).ok()).toBeTruthy();
  expect((await db.accreditationTask.findUniqueOrThrow({ where: { id: task.id } })).status).toBe("SUBMITTED");
});

test("CQI flags show on the stage-gates page and can be marked resolved", async ({ browser }) => {
  const db = await testDb();
  const head = await db.user.findFirstOrThrow({ where: { username: "dream.head" }, select: { id: true } });
  const flag = await db.cqiRevisionFlag.create({ data: { id: randomUUID(), chairmanId: head.id, courseId: `e2e-${run}`, courseCode: "CS-1001", courseTitle: "Programming Fundamentals", ploLabel: "PLO-2", attainment: 41.5, termName: "Fall", termYear: 2026 } });
  const hc = await as(browser, "dream.head");
  const page = await hc.newPage();
  await page.goto(`/curricula/builder/${copyId}/gates`);
  await expect(page.locator("body")).not.toContainText(BROKEN);
  const row = page.getByTestId("cqi-flags").locator("[data-flag]", { hasText: "PLO-2 attainment 41.5%" });
  await expect(row).toBeVisible();
  await expect(row.getByRole("button", { name: "Resolved" })).toBeVisible();
  // A teacher can't resolve it; the curriculum team can.
  const t = await as(browser, "dream.instructor");
  expect((await t.request.post("/api/scheduling", { data: { action: "resolveFlag", id: flag.id } })).ok()).toBeFalsy();
  expect((await hc.request.post("/api/scheduling", { data: { action: "resolveFlag", id: flag.id } })).ok()).toBeTruthy();
  const f = await db.cqiRevisionFlag.findUniqueOrThrow({ where: { id: flag.id } });
  expect(f.resolvedAt).not.toBeNull();
  expect(f.resolvedById).toBe(head.id);
  await page.reload();
  await expect(page.locator("[data-flag]", { hasText: "PLO-2 attainment 41.5%" })).toHaveCount(0);
});
