import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { BROKEN, BROKEN_HTML, json, signIn, testDb } from "./helpers";
import { DEMO_ROLES } from "../../lib/demoReadyCore";

// "Make demo ready" (Part 1). It deletes and rebuilds the demo institute, so it runs only on its own database:
//   E2E_DEMO_READY=1 E2E_DATABASE_URL=…/obe_e2e_demo npx playwright test demoReady
// (that database needs the schema, the migrations and an e2e.super login; the demo is built by the test itself).
test.skip(!process.env.E2E_DEMO_READY, "Rebuilds the demo institute: set E2E_DEMO_READY=1 and use its own database.");
test.describe.configure({ mode: "serial" });

const post = async (r: APIRequestContext, url: string, data: unknown) => { const x = await r.post(url, { data, timeout: 120_000 }); return { s: x.status(), d: await json(x) }; };
async function demoLogin(r: APIRequestContext, role: string) { const x = await post(r, "/api/auth/demo-login", { role }); expect(x.s, JSON.stringify(x.d)).toBe(200); return x.d.href as string; }

async function crawl(page: Page, home: string) {
  await page.goto(home);
  await page.waitForLoadState("networkidle").catch(() => null);
  const choose = page.getByRole("button", { name: /^Continue as / }).first();
  if (await choose.isVisible().catch(() => false)) { await choose.click(); await page.waitForLoadState("networkidle").catch(() => null); await page.goto(home); }
  await expect(page.locator("body")).not.toContainText(BROKEN);
  const expand = page.getByRole("button", { name: "Expand all" }).first();
  if (await expand.isVisible().catch(() => false)) await expand.click();
  const hrefs = await page.locator("nav a[href^='/'], aside a[href^='/'], .sidebar a[href^='/']").evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute("href") || ""));
  const links = Array.from(new Set(hrefs.filter((h) => h && !h.startsWith("/api/") && !/logout|sign-?out/i.test(h)).map((h) => h.split("#")[0])));
  const bad: string[] = [];
  for (const href of links) {
    const r = await page.request.get(href, { timeout: 120_000 });
    const body = r.status() < 400 ? await r.text() : "";
    if (r.status() >= 500 || BROKEN_HTML.test(body)) bad.push(`${href}: ${r.status()}`);
  }
  return { links, bad };
}

let demoCourseId = "";

test("Make demo ready on an empty demo institute completes", async ({ playwright }) => {
  test.setTimeout(3_600_000);
  const r = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL });
  await signIn(r, "e2e.super");
  const st = await post(r, "/api/admin/demo", { step: "readyStatus" });
  expect(st.s).toBe(200);
  const steps = st.d.steps as string[];
  expect(steps.length).toBeGreaterThan(100);
  for (let i = 0; i < steps.length; i++) {
    for (let pass = 0; pass < 80; pass++) {
      const x = await post(r, "/api/admin/demo", { step: "ready", index: i });
      expect(x.s, `${i} ${steps[i]}: ${JSON.stringify(x.d)}`).toBe(200);
      if (!x.d.again) break;
    }
  }
  const done = await post(r, "/api/admin/demo", { step: "readyStatus" });
  expect(done.d.flagged).toBe(true);
  expect(done.d.loginsOn).toBe(true);
  expect(done.d.demoCourse?.result).toBe("NOT SUBMITTED");
  // The readiness of BS CS (semester 5) is complete: every check green.
  expect(done.d.state.open, (done.d.state.open || []).join("\n")).toEqual([]);
  expect(done.d.state.overall).toBe(100);
  demoCourseId = done.d.demoCourse.id;
  await r.dispose();
});

test("only the demo course is missing final marks; every other running course's result is approved", async () => {
  const db = await testDb();
  const head = await db.user.findUniqueOrThrow({ where: { username: "dream.head" } });
  const flag = (await (db as unknown as Record<string, any>).demoFlag.findUnique({ where: { chairmanId: head.id } }))!;
  demoCourseId = flag.demoCourseId;
  const running = await db.course.findMany({ where: { coordinator: { managedById: head.id }, isOffered: true, offeredTermName: "Fall", offeredTermYear: 2026 }, select: { id: true, code: true, _count: { select: { studentEnrollments: true } } } });
  expect(running.length).toBeGreaterThan(40);
  const results = await (db as unknown as Record<string, any>).courseResult.findMany({ where: { courseId: { in: running.map((c) => c.id) } }, select: { courseId: true, status: true } });
  const st = new Map(results.map((x: { courseId: string; status: string }) => [x.courseId, x.status]));
  const notApproved = running.filter((c) => c.id !== demoCourseId && st.get(c.id) !== "APPROVED").map((c) => c.code);
  expect(notApproved, "running courses without an approved result").toEqual([]);
  expect(st.get(demoCourseId)).toBeUndefined();
  for (const c of running) {
    const insts = await db.assessmentInstrument.findMany({ where: { courseId: c.id, source: "INSTRUCTOR" }, select: { type: true, _count: { select: { studentMarks: true } } } });
    for (const i of insts) {
      if (c.id === demoCourseId && i.type === "Final") expect(i._count.studentMarks).toBe(0);
      else expect(i._count.studentMarks, `${c.code} ${i.type}`).toBe(c._count.studentEnrollments);
    }
  }
  // About 120 students a batch, 4 batches a program.
  const batches = await db.batch.findMany({ where: { coordinator: { managedById: head.id } }, select: { _count: { select: { students: true } } } });
  expect(batches.length).toBeGreaterThanOrEqual(12);
});

test("every page of every demo role opens without error", async ({ browser }) => {
  test.setTimeout(3_600_000);
  const bad: string[] = [];
  for (const role of DEMO_ROLES) {
    const ctx = await browser.newContext();
    const href = await demoLogin(ctx.request, role.key);
    const page = await ctx.newPage();
    const { links, bad: b } = await crawl(page, role.student ? "/student/dashboard" : href);
    expect(links.length, `${role.label}: the menu has links`).toBeGreaterThan(2);
    bad.push(...b.map((x) => `${role.label} ${x}`));
    await ctx.close();
  }
  expect(bad, bad.join("\n")).toEqual([]);
});

test("the live demo: final marks (typed and sample), submit, HOD approves, Controller publishes; readiness and SAR complete", async ({ browser }) => {
  test.setTimeout(900_000);
  const db = await testDb();
  // Instructor: the top task is the final-exam marks of the demo course.
  const ins = await browser.newContext();
  await demoLogin(ins.request, "instructor");
  const page = await ins.newPage();
  await page.goto("/dashboard");
  await expect(page.getByText(/Enter final-exam marks for/).first()).toBeVisible();
  // A real typed mark works …
  const final = await db.assessmentInstrument.findFirstOrThrow({ where: { courseId: demoCourseId, source: "INSTRUCTOR", type: "Final" } });
  const en = await db.studentEnrollment.findFirstOrThrow({ where: { courseId: demoCourseId }, orderBy: { student: { rollNumber: "asc" } } });
  const typed = await ins.request.put(`/api/instructor/courses/${demoCourseId}/marks`, { data: { studentId: en.studentId, instrumentId: final.id, score: Math.min(final.maxScore, 77) } });
  expect(typed.status()).toBe(200);
  // … and "Fill sample marks" fills the rest in one click (the typed one is kept).
  await page.goto(`/instructor/courses/${demoCourseId}/marks`);
  await page.locator("[data-fill-sample-marks]").click();
  await expect(page.getByText(/marks filled/)).toBeVisible({ timeout: 60_000 });
  expect((await db.studentMark.findUniqueOrThrow({ where: { studentId_instrumentId: { studentId: en.studentId, instrumentId: final.id } } })).score).toBe(Math.min(final.maxScore, 77));
  const sub = await post(ins.request, `/api/instructor/courses/${demoCourseId}/result`, { action: "submit" });
  expect(sub.s, JSON.stringify(sub.d)).toBe(200);
  // HOD approves, Controller publishes (one click each).
  const hod = await browser.newContext();
  await demoLogin(hod.request, "hod");
  const ap = await post(hod.request, "/api/results/decide", { courseId: demoCourseId, action: "approve" });
  expect(ap.s, JSON.stringify(ap.d)).toBe(200);
  const ctl = await browser.newContext();
  await demoLogin(ctl.request, "controller");
  const pub = await post(ctl.request, "/api/controller", { action: "publish", courseIds: [demoCourseId] });
  expect(pub.s, JSON.stringify(pub.d)).toBe(200);
  // Program Lead: readiness and the SAR.
  const lead = await browser.newContext();
  await demoLogin(lead.request, "lead");
  const course = await db.course.findUniqueOrThrow({ where: { id: demoCourseId }, select: { batchId: true } });
  const lp = await lead.newPage();
  await lp.goto(`/coordinator/accreditation-status?batchId=${course.batchId}`);
  await expect(lp.locator("body")).not.toContainText(BROKEN);
  const sar = await lead.request.get(`/coordinator/sar?batchId=${course.batchId}`, { timeout: 120_000 });
  expect(sar.status()).toBe(200);
  expect(BROKEN_HTML.test(await sar.text())).toBe(false);
  // Every result of the running semester is now approved.
  const head = await db.user.findUniqueOrThrow({ where: { username: "dream.head" } });
  const running = await db.course.findMany({ where: { coordinator: { managedById: head.id }, isOffered: true, offeredTermName: "Fall", offeredTermYear: 2026 }, select: { id: true } });
  const approved = await (db as unknown as Record<string, any>).courseResult.count({ where: { courseId: { in: running.map((c) => c.id) }, status: "APPROVED" } });
  expect(approved).toBe(running.length);
  for (const c of [ins, hod, ctl, lead]) await c.close();
});

test("Reset demo restores the starting state", async ({ playwright }) => {
  const r = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL });
  await signIn(r, "e2e.super");
  const x = await post(r, "/api/admin/demo", { step: "reset" });
  expect(x.s, JSON.stringify(x.d)).toBe(200);
  const db = await testDb();
  const finals = await db.assessmentInstrument.findMany({ where: { courseId: demoCourseId, type: "Final" }, select: { _count: { select: { studentMarks: true } } } });
  expect(finals.every((f) => f._count.studentMarks === 0)).toBe(true);
  expect(await (db as unknown as Record<string, any>).courseResult.findUnique({ where: { courseId: demoCourseId } })).toBeNull();
  const st = await post(r, "/api/admin/demo", { step: "readyStatus" });
  expect(st.d.demoCourse.result).toBe("NOT SUBMITTED");
  await r.dispose();
});

test("demo logins and sample marks are refused outside the demo", async ({ playwright }) => {
  const r = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL });
  await signIn(r, "e2e.super");
  expect((await post(r, "/api/admin/demo", { step: "logins", on: false })).s).toBe(200);
  const anon = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL });
  expect((await post(anon, "/api/auth/demo-login", { role: "instructor" })).s).toBe(403);
  expect((await post(anon, "/api/auth/demo-login", { role: "nobody" })).s).toBe(403);
  expect((await post(r, "/api/admin/demo", { step: "logins", on: true })).s).toBe(200);
  // A course of another institute: refused (not the teacher's, not a demo).
  const db = await testDb();
  const ins = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL });
  await demoLogin(ins, "instructor");
  const other = await db.course.findFirst({ where: { coordinator: { managedBy: { username: { not: "dream.head" } } } }, select: { id: true } });
  expect((await post(ins, "/api/demo/fill-marks", { courseId: other?.id || "not-a-course" })).s).toBe(403);
  for (const c of [r, anon, ins]) await c.dispose();
});
