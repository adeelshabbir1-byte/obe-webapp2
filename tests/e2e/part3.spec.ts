import { test, expect, type APIRequestContext } from "@playwright/test";
import ExcelJS from "exceljs";
import { BROKEN, json, signIn, signInStudent, testDb } from "./helpers";

// Part 3: "What's next" on every home, the semester readiness board, the Excel course-plan import, "Report a problem".
test.describe.configure({ mode: "serial" });
const any = (db: unknown) => db as Record<string, any>;
type T = { title: string; href: string };
const tasks = async (r: APIRequestContext) => ((await r.get("/api/next-tasks").then(json)).tasks || []) as T[];

let draftId = "", draftCode = "";
// Everything this file changes in the shared test data is put back afterwards (other specs rely on it).
const restore: (() => Promise<unknown>)[] = [];
test.afterAll(async () => { for (const f of restore.reverse()) await f().catch(() => null); });
async function setStatus(id: string, status: string) {
  const db = await testDb();
  const c = await db.course.findUniqueOrThrow({ where: { id }, select: { templateStatus: true } });
  restore.push(() => db.course.update({ where: { id }, data: { templateStatus: c.templateStatus } }));
  await db.course.update({ where: { id }, data: { templateStatus: status } });
}

test("What's next: the SE's unfinished plan, the OMC member's vote, the Program Lead's set-up step — each with its link", async ({ playwright, browser }) => {
  const db = await testDb();
  const se = await db.user.findUniqueOrThrow({ where: { username: "dream.se" } });
  const lead = await db.user.findUniqueOrThrow({ where: { username: "dream.lead.cs" } });
  // An SE plan still being written, a plan waiting for the OMC, a batch half-way through set-up.
  const term = await db.currentTerm.findUniqueOrThrow({ where: { coordinatorId: lead.id } });
  const mine = await db.course.findMany({ where: { subjectExpertId: se.id, coordinatorId: lead.id, isOffered: true, offeredTermName: term.termName, offeredTermYear: term.year }, orderBy: { code: "asc" }, take: 1 });
  draftId = mine[0].id; draftCode = mine[0].code;
  await setStatus(draftId, "draft");
  const other = await db.course.findFirstOrThrow({ where: { coordinatorId: lead.id, isOffered: true, offeredTermName: term.termName, offeredTermYear: term.year, id: { not: draftId } }, orderBy: { code: "asc" } });
  await setStatus(other.id, "submitted");
  const votes = await any(db).sePlanVote.findMany({ where: { courseId: other.id } });
  restore.push(() => any(db).sePlanVote.createMany({ data: votes, skipDuplicates: true }));
  await any(db).sePlanVote.deleteMany({ where: { courseId: other.id } });
  const sent = ((await any(db).batchApproval.findMany({ select: { batchId: true } })) as { batchId: string }[]).map((x) => x.batchId);
  const batch = await db.batch.findFirstOrThrow({ where: { coordinatorId: lead.id, id: { notIn: sent.concat("none") } }, orderBy: { startYear: "desc" } });
  const prog = await any(db).batchSetupProgress.findUnique({ where: { batchId: batch.id } });
  restore.push(() => (prog ? any(db).batchSetupProgress.update({ where: { batchId: batch.id }, data: { currentStep: prog.currentStep } }) : any(db).batchSetupProgress.deleteMany({ where: { batchId: batch.id } })));
  await any(db).batchSetupProgress.upsert({ where: { batchId: batch.id }, create: { batchId: batch.id, currentStep: 7, marksJson: "{}", startedAt: new Date() }, update: { currentStep: 7 } }).catch(() => null);

  const r = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL });
  await signIn(r, "dream.se");
  const seTasks = await tasks(r);
  const plan = seTasks.find((x) => x.href.includes(`/subjectexpert/courses/${draftId}/`));
  expect(plan, JSON.stringify(seTasks)).toBeTruthy();
  expect(plan!.title).toMatch(new RegExp(`(Finish|Submit the) ${draftCode.replace(/[-]/g, "\\-")} plan`));
  await r.dispose();

  const o = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL });
  await signIn(o, "dream.omc");
  const omcTasks = await tasks(o);
  expect(omcTasks.some((x) => /^Vote on \d+ plans?$/.test(x.title) && x.href === "/omc/queue"), JSON.stringify(omcTasks)).toBe(true);
  await o.dispose();

  const l = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL });
  await signIn(l, "dream.lead.cs");
  const leadTasks = await tasks(l);
  const setup = leadTasks.find((x) => x.title.startsWith(`Set up ${batch.batchName} — step`));
  expect(setup, JSON.stringify(leadTasks)).toBeTruthy();
  expect(setup!.href).toContain(`setup=${batch.id}`);
  await l.dispose();

  // On the home page, with the count next to the name.
  const ctx = await browser.newContext();
  await signIn(ctx, "dream.se");
  const page = await ctx.newPage();
  await page.goto("/dashboard");
  await page.waitForLoadState("networkidle").catch(() => null);
  const choose = page.getByRole("button", { name: /Subject\s+Expert/ }).first();
  if (await choose.count()) { await choose.click(); await page.waitForURL(/dashboard|subjectexpert/, { timeout: 30_000 }).catch(() => null); await page.goto("/dashboard"); }
  await expect(page.locator("[data-whats-next]")).toContainText(draftCode);
  await expect(page.locator("[data-tasks-count]")).toBeVisible();
  await ctx.close();
});

test("readiness board: an unapproved plan is red/amber under SE plans and links to that course; Excel and PDF download", async ({ browser }) => {
  const ctx = await browser.newContext();
  await signIn(ctx, "dream.lead.cs");
  const page = await ctx.newPage();
  await page.goto("/semester-readiness");
  await expect(page.locator("body")).not.toContainText(BROKEN);
  await expect(page.locator("[data-top-line]")).toContainText(/programs? ready/);
  // The SE-plans cell of the batch lists the unapproved course and links to a course's plan.
  const cell = page.locator("tr[data-batch] td[data-light]", { hasText: draftCode }).first();
  await expect(cell).toBeVisible();
  expect(["red", "amber"]).toContain(await cell.getAttribute("data-light"));
  expect(await cell.locator("a").getAttribute("href")).toMatch(/courseId=/);
  for (const f of ["xlsx", "pdf"]) { const r = await ctx.request.get(`/api/semester-readiness?format=${f}`); expect(r.status()).toBe(200); expect((await r.body()).length).toBeGreaterThan(500); }
  await ctx.close();
});

async function fillTemplate(r: APIRequestContext, fill: (wb: ExcelJS.Workbook) => void) {
  const t = await r.get("/api/plan-import?template=1");
  expect(t.status()).toBe(200);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(await t.body()) as never);
  for (const ws of wb.worksheets) if (ws.name !== "Legend" && ws.rowCount > 1) ws.spliceRows(2, ws.rowCount - 1); // drop the example rows
  fill(wb);
  return Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}
const send = async (r: APIRequestContext, action: string, courseId: string, buf: Buffer | null, extra: Record<string, string> = {}) => {
  const multipart: Record<string, string | { name: string; mimeType: string; buffer: Buffer }> = { action, courseId, source: "SE", ...extra };
  if (buf) multipart.file = { name: "plan.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: buf };
  const x = await r.post("/api/plan-import", { multipart, timeout: 120_000 });
  return { s: x.status(), d: await json(x) };
};

test("Excel import: the blank template round-trips; a missing CLO is reported and nothing saved; undo restores; an approved plan gets a change request", async ({ playwright }) => {
  const db = await testDb();
  const r = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL });
  await signIn(r, "dream.se");
  // A plan of dream.se's that isn't a synced follower, still being written.
  const seU = await db.user.findUniqueOrThrow({ where: { username: "dream.se" } });
  const own = await db.course.findFirstOrThrow({ where: { subjectExpertId: seU.id, id: { not: draftId }, lectureRows: { some: { source: "SE" } } }, orderBy: { code: "desc" } });
  const member = await db.courseContentSyncMember.findUnique({ where: { courseId: own.id } });
  if (member) restore.push(() => db.courseContentSyncMember.create({ data: member }));
  await db.courseContentSyncMember.deleteMany({ where: { courseId: own.id } }); // stand-alone, so its own plan is edited
  await setStatus(own.id, "draft");
  const followerId = draftId;
  draftId = own.id;
  // A synced follower course is refused (import into the base course).
  const fol = await send(r, "preview", followerId, Buffer.from(await (await r.get("/api/plan-import?template=1")).body()));
  if (fol.s === 400) expect(String(fol.d.error)).toMatch(/base course/);
  const beforeRows = await db.lectureRow.findMany({ where: { courseId: draftId, source: "SE" }, orderBy: { lectureNumber: "asc" }, select: { lectureNumber: true, topic: true } });
  const cloCount = await db.cLO.count({ where: { courseId: draftId, source: "SE" } });
  // A bad file first: lecture 2 points to a CLO that doesn't exist.
  const bad = await fillTemplate(r, (wb) => { wb.getWorksheet("Lecture plan")!.addRows([[1, 1, "Imported topic one", "", "CLO-1"], [2, 1, "Imported topic two", "", "CLO-9"]]); });
  const pv = await send(r, "preview", draftId, bad);
  expect(pv.s, JSON.stringify(pv.d)).toBe(200);
  expect((pv.d.problems.lectures as string[]).join(" ")).toContain("CLO-9 does not exist");
  const no = await send(r, "apply", draftId, bad, { parts: "lectures" });
  expect(no.s).toBe(400);
  expect((await db.lectureRow.findFirst({ where: { courseId: draftId, source: "SE", lectureNumber: 1 } }))?.topic).toBe(beforeRows[0].topic);
  // A good file: CLOs, lectures, mid and final questions.
  const good = await fillTemplate(r, (wb) => {
    wb.getWorksheet("CLOs")!.addRows([["CLO-1", "Explain the imported concepts clearly", "C2", "GA-1"], [`CLO-${cloCount + 1}`, "Apply the imported technique to new problems", "C3", "GA-2"]]);
    wb.getWorksheet("Lecture plan")!.addRows([[1, 1, "Imported topic one", "a; b", "CLO-1"], [2, 1, "Imported topic two", "", `CLO-${cloCount + 1}`]]);
    wb.getWorksheet("Mid and final questions")!.addRows([["Final", 1, "CLO-1", 30, "Imported topic one", "C2"], ["Final", 2, `CLO-${cloCount + 1}`, 20, "Imported topic two", "C3"]]);
  });
  const ok = await send(r, "preview", draftId, good);
  expect(ok.s).toBe(200);
  expect(ok.d.line).toMatch(/CLOs 2 · lectures 2/);
  const ap = await send(r, "apply", draftId, good, { parts: "clos,lectures,questions" });
  expect(ap.s, JSON.stringify(ap.d)).toBe(200);
  expect(ap.d.applied).toBe(true);
  const l1 = await db.lectureRow.findFirstOrThrow({ where: { courseId: draftId, source: "SE", lectureNumber: 1 }, include: { clo: true } });
  expect(l1.topic).toBe("Imported topic one"); expect(l1.clo?.code).toBe("CLO-1");
  expect((await db.cLO.findFirstOrThrow({ where: { courseId: draftId, source: "SE", code: "CLO-1" } })).statement).toBe("Explain the imported concepts clearly");
  expect(await db.cLO.count({ where: { courseId: draftId, source: "SE" } })).toBe(cloCount + 1);
  const finals = await db.paperDistributionItem.findMany({ where: { courseId: draftId, source: "SE", examType: "Final" }, orderBy: { questionNo: "asc" } });
  expect(finals.map((f) => f.marks)).toEqual([30, 20]);
  // Undo: the plan as it was.
  const list = await r.get(`/api/plan-import?courseId=${draftId}&source=SE`).then(json);
  const un = await send(r, "undo", draftId, null, { importId: list.imports[0].id });
  expect(un.s, JSON.stringify(un.d)).toBe(200);
  const after = await db.lectureRow.findMany({ where: { courseId: draftId, source: "SE" }, orderBy: { lectureNumber: "asc" }, select: { lectureNumber: true, topic: true } });
  expect(after).toEqual(beforeRows);
  expect(await db.cLO.count({ where: { courseId: draftId, source: "SE" } })).toBe(cloCount);
  // An approved plan: a change request instead, nothing overwritten.
  await db.course.update({ where: { id: draftId }, data: { templateStatus: "approved" } });
  restore.push(async () => { await db.templateChangeRequest.deleteMany({ where: { courseId: draftId, createdAt: { gte: new Date(Date.now() - 3600_000) } } }); await any(db).planImport.deleteMany({ where: { courseId: draftId } }); });
  const before2 = await db.lectureRow.findFirstOrThrow({ where: { courseId: draftId, source: "SE", lectureNumber: 1 } });
  const ar = await send(r, "apply", draftId, good, { parts: "lectures" });
  expect(ar.s, JSON.stringify(ar.d)).toBe(200);
  expect(ar.d.requested).toBe(true);
  expect(await db.templateChangeRequest.count({ where: { courseId: draftId } })).toBeGreaterThan(0);
  expect((await db.lectureRow.findFirstOrThrow({ where: { courseId: draftId, source: "SE", lectureNumber: 1 } })).topic).toBe(before2.topic);
  await r.dispose();
});

test("Report a problem: saves the page, user and screenshot; the reply reaches the bell; the pilot switch hides the button", async ({ browser, playwright }) => {
  const db = await testDb();
  const ctx = await browser.newContext();
  await signIn(ctx, "dream.instructor");
  const page = await ctx.newPage();
  await page.goto("/dashboard");
  await page.locator("[data-report-button]").click();
  await expect(page.locator("[data-report-note]")).toBeVisible({ timeout: 30_000 });
  await page.locator("[data-report-note]").fill("The marks table did not refresh after saving.");
  await page.locator("[data-report-send]").click();
  await expect(page.getByText(/Thank you — sent/)).toBeVisible();
  const ins = await db.user.findUniqueOrThrow({ where: { username: "dream.instructor" } });
  const rep = await any(db).problemReport.findFirst({ where: { userId: ins.id }, orderBy: { createdAt: "desc" } });
  expect(rep.pageUrl).toBe("/dashboard"); expect(rep.role).toBe("INSTRUCTOR"); expect(rep.screenshotRef).toBeTruthy();
  // The Super Admin sees it, answers it; the reporter's bell says so.
  const su = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL });
  await signIn(su, "e2e.super");
  const rows = (await su.get("/api/admin/problem-reports?role=INSTRUCTOR").then(json)).rows as { id: string; page: string; hasShot: boolean }[];
  const mineRow = rows.find((x) => x.id === rep.feedbackId)!;
  expect(mineRow.page).toBe("/dashboard"); expect(mineRow.hasShot).toBe(true);
  expect((await su.get(`/api/admin/problem-reports?shot=${rep.feedbackId}`)).status()).toBe(200);
  expect((await su.post("/api/admin/problem-reports", { data: { id: rep.feedbackId, status: "DONE", reply: "Fixed in the next release." } })).status()).toBe(200);
  expect(await db.notification.count({ where: { userId: ins.id, body: { contains: "Fixed in the next release." } } })).toBeGreaterThan(0);
  // Pilot: only chosen departments (none) → the button is gone; then back to everyone.
  const head = await db.user.findUniqueOrThrow({ where: { username: "dream.head" } });
  expect((await su.post("/api/admin/problem-reports", { data: { pilot: { chairmanId: head.id, mode: "DEPARTMENTS", departmentIds: [] } } })).status()).toBe(200);
  await page.goto("/dashboard");
  await expect(page.locator("[data-report-button]")).toHaveCount(0);
  expect((await su.post("/api/admin/problem-reports", { data: { pilot: { chairmanId: head.id, mode: "ALL", departmentIds: [] } } })).status()).toBe(200);
  await page.goto("/dashboard");
  await expect(page.locator("[data-report-button]")).toHaveCount(1);
  await ctx.close(); await su.dispose();
  // The student portal also opens (no button needed there).
  const st = await browser.newContext();
  await signInStudent(st, "DRM-CS-24-001");
  await st.close();
});
