import { test, expect, type Browser, type BrowserContext } from "@playwright/test";
import { BROKEN, json, signIn, testDb } from "./helpers";

// The main journeys on the seeded demo institute (tests/e2e/seed.ts). They run in order and change the test database.
test.describe.configure({ mode: "serial" });

const as = async (browser: Browser, username: string) => { const ctx = await browser.newContext(); await signIn(ctx, username); return ctx; };
const get = async (ctx: BrowserContext, url: string) => { const r = await ctx.request.get(url); return { status: r.status(), d: await json(r) }; };
const send = async (ctx: BrowserContext, method: "POST" | "PUT" | "PATCH", url: string, data: unknown) => { const r = await ctx.request.fetch(url, { method, data }); return { status: r.status(), d: await json(r) }; };

let reviewCourse = "", csBatch = "";

test("1 + 3 — registration waits for an unapproved plan; SE submits, OMC votes, Convener confirms; registration opens", async ({ browser }) => {
  const pl = await as(browser, "dream.lead.cs");
  const batches = (await get(pl, "/api/coordinator/batch-schedule-config")).d.batches as { id: string; batchName?: string; label?: string }[];
  csBatch = batches.find((b) => /BSCS/.test(b.batchName || b.label || ""))!.id;
  const blocked = await send(pl, "PUT", `/api/coordinator/batches/${csBatch}/toggle-registration`, { open: true });
  expect(blocked.status, JSON.stringify(blocked.d)).toBe(409);
  expect(String(blocked.d.error)).toMatch(/Registration waits for the OMC-approved plan/);
  const code = /: ([A-Z]{2}-\d{3}[A-Z]?)/.exec(String(blocked.d.error))?.[1] || "CC-312";

  // The Subject Expert opens the plan and submits it.
  const db = await testDb();
  const se = await as(browser, "dream.se");
  const course = await db.course.findFirstOrThrow({ where: { batchId: csBatch, code, subjectExpert: { username: "dream.se" } }, select: { id: true } });
  reviewCourse = course.id;
  const page = await se.newPage();
  await page.goto(`/subjectexpert/courses/${reviewCourse}/clos`);
  await expect(page.locator("body")).not.toContainText(BROKEN);
  const submit = await send(se, "POST", `/api/subjectexpert/courses/${reviewCourse}/submit`, {});
  expect(submit.status, JSON.stringify(submit.d)).toBe(200);

  // Three OMC members vote; the Convener confirms.
  for (const u of ["dream.omc2", "dream.omc3", "dream.omc"]) {
    const omc = await as(browser, u);
    const v = await send(omc, "POST", `/api/omc/templates/${reviewCourse}`, { action: "vote", approve: true, note: "Meets the outline." });
    expect(v.status, `${u}: ${JSON.stringify(v.d)}`).toBe(200);
    await omc.close();
  }
  const convener = await as(browser, "dream.omc");
  const c = await send(convener, "POST", `/api/omc/templates/${reviewCourse}`, { action: "confirm" });
  expect(c.status, JSON.stringify(c.d)).toBe(200);

  const open = await send(pl, "PUT", `/api/coordinator/batches/${csBatch}/toggle-registration`, { open: true });
  expect(open.status, JSON.stringify(open.d)).toBe(200);
  expect(open.d.registrationOpen).toBe(true);
});

test("2 — Program Lead sets up a new batch step by step, sends it to the OMC, the OMC finalises it", async ({ browser }) => {
  const pl = await as(browser, "dream.lead.cs");
  const progs = await pl.request.get("/coordinator/batches");
  expect(progs.status()).toBe(200);
  const programs = (await get(pl, "/api/coordinator/degree-programs")).d;
  const programId = (programs.programs || [])[0]?.id;
  expect(programId, JSON.stringify(programs).slice(0, 200)).toBeTruthy();
  const made = await send(pl, "POST", "/api/coordinator/new-intake", { term: "Spring", year: 2027, programIds: [programId] });
  expect(made.status, JSON.stringify(made.d)).toBe(200);
  const batchId = (made.d.created || [])[0]?.batchId;
  expect(batchId).toBeTruthy();
  // Steps 2–4: the source is the program's earlier batch; its courses come in (in chunks), as the set-up page does.
  const db = await testDb();
  const source = await db.batch.findFirstOrThrow({ where: { batchName: "BSCS Fall 2024" }, select: { id: true } });
  let cursor: string | undefined;
  for (let i = 0; i < 50; i++) {
    const c = await send(pl, "POST", "/api/coordinator/courses/copy-from-batch", { sourceBatchId: source.id, targetBatchId: batchId, cursor });
    expect(c.status, JSON.stringify(c.d)).toBe(200);
    cursor = c.d.nextCursor; if (!c.d.mightHaveMore || !cursor) break;
  }
  expect(await db.course.count({ where: { batchId } })).toBeGreaterThan(10);
  const page = await pl.newPage();
  await page.goto(`/coordinator/batches/${batchId}/setup`);
  await expect(page.locator("body")).not.toContainText(BROKEN);
  for (let n = 1; n <= 12; n++) {
    const s = await send(pl, "POST", "/api/coordinator/batch-flow", { batchId, action: "done", step: n });
    expect(s.status, `step ${n}: ${JSON.stringify(s.d)}`).toBe(200);
  }
  const sent = await send(pl, "POST", "/api/coordinator/batch-flow", { batchId, action: "submit" });
  expect(sent.status, JSON.stringify(sent.d)).toBe(200);
  for (const u of ["dream.omc2", "dream.omc3"]) {
    const omc = await as(browser, u);
    const e = await send(omc, "POST", "/api/omc/batch-review", { batchId, action: "endorse", yes: true, note: "Agreed." });
    expect(e.status, `${u}: ${JSON.stringify(e.d)}`).toBe(200);
    await omc.close();
  }
  const convener = await as(browser, "dream.omc");
  const f = await send(convener, "POST", "/api/omc/batch-review", { batchId, action: "finalise" });
  expect(f.status, JSON.stringify(f.d)).toBe(200);
  expect(String(f.d.message)).toMatch(/approved by the OMC/);
});

test("4 — Instructor enters marks, the result is approved, CLO / GA attainment appears", async ({ browser }) => {
  const ins = await as(browser, "dream.t3");
  const db = await testDb();
  const course = await db.course.findFirstOrThrow({ where: { code: "DC-321", instructor: { username: "dream.t3" }, isOffered: true, semesterNumber: 5 }, select: { id: true } });
  const page = await ins.newPage();
  await page.goto(`/instructor/courses/${course.id}/marks`);
  await expect(page.locator("body")).not.toContainText(BROKEN);
  const students = (await db.studentEnrollment.findMany({ where: { courseId: course.id, status: "ACTIVE" }, select: { studentId: true } }));
  const instruments = await db.assessmentInstrument.findMany({ where: { courseId: course.id, source: "INSTRUCTOR" }, select: { id: true, maxScore: true } });
  expect(students.length).toBeGreaterThan(0);
  expect(instruments.length).toBeGreaterThan(0);
  let k = 0;
  for (const s of students) for (const i of instruments) {
    const r = await ins.request.put(`/api/instructor/courses/${course.id}/marks`, { data: { studentId: s.studentId, instrumentId: i.id, score: Math.round(i.maxScore * (0.45 + ((k++ * 37) % 50) / 100)) } });
    expect(r.status(), await r.text()).toBe(200);
  }
  const sub = await send(ins, "POST", `/api/instructor/courses/${course.id}/result`, { action: "submit" });
  expect(sub.status, JSON.stringify(sub.d)).toBe(200);
  const hod = await as(browser, "dream.hod.cs");
  const ap = await send(hod, "POST", "/api/results/decide", { courseId: course.id, action: "approve" });
  expect(ap.status, JSON.stringify(ap.d)).toBe(200);
  await page.goto(`/instructor/courses/${course.id}/review`);
  await expect(page.locator("body")).not.toContainText(BROKEN);
  await expect(page.locator("body")).toContainText(/CLO-1/);
  await expect(page.locator("body")).toContainText(/\d+(\.\d+)?%/);
});

test("5 — Department Coordinator: timetable, auto-generate sections (none over 50), download the constraints file", async ({ browser }) => {
  const dc = await as(browser, "dream.dc");
  const page = await dc.newPage();
  await page.goto("/coordinator/timetable");
  await expect(page.locator("body")).not.toContainText(BROKEN);
  await expect(page.locator("body")).toContainText("Programs on this timetable");
  const gen = await send(dc, "POST", "/api/coordinator/schedule-sections/auto-generate", {});
  expect(gen.status, JSON.stringify(gen.d)).toBe(200);
  const secs = (await get(dc, "/api/coordinator/schedule-sections")).d.sections as { size: number }[];
  expect(secs.length).toBeGreaterThan(0);
  expect(Math.max(...secs.map((s) => s.size))).toBeLessThanOrEqual(50);
  const x = await dc.request.get("/api/coordinator/timetable/download-constraints");
  expect(x.status()).toBe(200);
  expect(x.headers()["content-disposition"] || "").toMatch(/attachment/);
  expect((await x.body()).length).toBeGreaterThan(1000);
});
