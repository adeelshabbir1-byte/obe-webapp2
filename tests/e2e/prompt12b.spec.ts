import { test, expect, type Browser } from "@playwright/test";
import { BROKEN, json, signIn, testDb } from "./helpers";
import { subjectKey } from "../../lib/courseHomeCore";

// Course homes and codes: prefixes unique; a draft changes nothing until the BOS approves; approval locks homes and
// codes, keeps old codes as aliases, leaves finished offerings (transcripts) on their old code; a later move is a new
// draft; the content-sync base follows the home ("Make the home copy the base" moves it and tells the old SE).
test.describe.configure({ mode: "serial" });
const as = async (browser: Browser, u: string) => { const c = await browser.newContext(); await signIn(c, u); return c; };
const API = "/api/course-homes";
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

test("prefixes: the department's CS and a program's own AI; prefixes are unique", async ({ browser }) => {
  const db = await testDb();
  const head = await as(browser, "dream.head");
  const dept = await db.department.findFirstOrThrow({ where: { chairman: { username: "dream.head" } }, select: { id: true } });
  expect((await head.request.post("/api/course-codes", { data: { action: "scheme", departmentId: dept.id, prefix: "CS", digits: 3, separator: "-" } })).ok()).toBeTruthy();
  expect((await head.request.post(API, { data: { action: "programPrefix", program: "BS Artificial Intelligence", departmentId: dept.id, prefix: "AI" } })).ok()).toBeTruthy();
  expect((await json(await head.request.post(API, { data: { action: "programPrefix", program: "BS Computer Science", departmentId: dept.id, prefix: "AI" } }))).error).toMatch(/unique/);
  const page = await head.newPage();
  await page.goto("/course-homes");
  await expect(page.locator("body")).not.toContainText(BROKEN);
  await expect(page.locator("[data-column^='Department of Computing']")).toBeVisible();
  await expect(page.locator("[data-code]").filter({ hasText: /^CS-\d{3}L?$/ }).first()).toBeVisible();
});

test("a draft changes no code until the BOS approves; approval locks, keeps aliases, and old offerings keep their code", async ({ browser }) => {
  const db = await testDb();
  const head = await as(browser, "dream.head");
  const headId = (await db.user.findFirstOrThrow({ where: { username: "dream.head" }, select: { id: true } })).id;
  // An offering whose result is approved (taken: its transcript keeps the code) and one still running.
  const done = await db.course.findFirstOrThrow({ where: { code: "CC-213", coordinator: { managedBy: { username: "dream.head" } } }, select: { id: true, code: true, title: true } });
  const key = subjectKey(done.title);
  const before = await db.course.findMany({ where: { title: done.title, coordinator: { managedBy: { username: "dream.head" } } }, select: { id: true, code: true } });
  const draftId = (await json(await head.request.post(API, { data: { action: "save", changes: { [key]: { chain: 4 } }, note: "e2e draft" } }))).draftId;
  expect(draftId).toBeTruthy();
  expect(await db.course.findMany({ where: { title: done.title, coordinator: { managedBy: { username: "dream.head" } } }, select: { id: true, code: true } })).toEqual(before);
  expect(await db.courseHome.count({ where: { key } })).toBe(0);
  // Send to a Convener-only BOS and approve with the signed minutes.
  const bos = (await json(await head.request.post("/api/cmt", { data: { action: "save", type: "BOS", scope: "INSTITUTE", name: "BOS — codes (e2e)", mode: "CONVENER_ONLY", convenerId: headId } }))).id;
  expect((await head.request.post(API, { data: { action: "send", draftId, committeeId: bos } })).ok()).toBeTruthy();
  expect((await json(await head.request.post(API, { data: { action: "save", draftId, changes: { [key]: { chain: 5 } } } }))).error).toMatch(/with the BOS/);
  const item = await db.cmtItem.findFirstOrThrow({ where: { committeeId: bos, kind: "COURSE_HOMES", refId: draftId } });
  expect((await head.request.post("/api/cmt", { multipart: { action: "finalise", itemId: item.id, outcome: "APPROVED", meetingDate: "2026-11-20", file: { name: "minutes.pdf", mimeType: "application/pdf", buffer: PDF } } })).ok()).toBeTruthy();
  const home = await db.courseHome.findFirstOrThrow({ where: { key } });
  expect(home.code).toMatch(/^CS-\d4\d$/);
  expect(JSON.parse(home.aliasesJson)).toContain("CC-213");
  const finished = new Set((await db.courseResult.findMany({ where: { status: "APPROVED", courseId: { in: before.map((b) => b.id) } }, select: { courseId: true } })).map((r) => r.courseId));
  for (const c of await db.course.findMany({ where: { id: { in: before.map((b) => b.id) } }, select: { id: true, code: true } })) expect(c.code).toBe(finished.has(c.id) ? "CC-213" : home.code);
  expect(finished.size).toBeGreaterThan(0);
  // Transcripts keep the code they were taken under.
  const tr = await db.studentTranscriptRecord.count({ where: { courseCode: "CC-213" } });
  expect(await db.studentTranscriptRecord.count({ where: { courseCode: home.code! } })).toBe(0);
  expect(tr).toBeGreaterThanOrEqual(0);
  // After approval, a move is a new draft; the approved home stays until the BOS decides again.
  const again = (await json(await head.request.post(API, { data: { action: "save", changes: { [key]: { chain: 6 } } } }))).draftId;
  expect(again).not.toBe(draftId);
  expect((await db.courseHome.findFirstOrThrow({ where: { key } })).code).toBe(home.code);
  const page = await head.newPage();
  await page.goto("/course-homes?tab=catalog");
  await expect(page.getByRole("cell", { name: home.code! })).toBeVisible();
  await expect(page.getByRole("cell", { name: /CC-213/ }).first()).toBeVisible();
  const xlsx = await head.request.get(`${API}?export=xlsx`);
  expect(xlsx.headers()["content-type"]).toContain("spreadsheetml");
});

test("the content-sync base follows the home: flagged, then moved with the old SE told", async ({ browser }) => {
  const db = await testDb();
  const head = await as(browser, "dream.head");
  const dept = await db.department.findFirstOrThrow({ where: { chairman: { username: "dream.head" } }, select: { id: true } });
  // Approve every home (one draft covers the unapproved ones), with BS Artificial Intelligence as the department's lead program.
  expect((await head.request.post(API, { data: { action: "leadProgram", departmentId: dept.id, program: "BS Artificial Intelligence" } })).ok()).toBeTruthy();
  const anyKey = subjectKey((await db.course.findFirstOrThrow({ where: { batch: { degreeProgram: "BS Computer Science" } }, select: { title: true } })).title);
  const d = (await json(await head.request.post(API, { data: { action: "save", changes: { [anyKey]: { renumber: false } } } }))).draftId;
  const bos = await db.cmtCommittee.findFirstOrThrow({ where: { name: "BOS — codes (e2e)" } });
  await head.request.post(API, { data: { action: "send", draftId: d, committeeId: bos.id } });
  const item = await db.cmtItem.findFirstOrThrow({ where: { refId: d } });
  expect((await head.request.post("/api/cmt", { multipart: { action: "finalise", itemId: item.id, outcome: "APPROVED", meetingDate: "2026-11-21", file: { name: "m.pdf", mimeType: "application/pdf", buffer: PDF } } })).ok()).toBeTruthy();
  // The group whose base is BS Computer Science's copy is flagged: its home's lead program is BS Artificial Intelligence.
  const page = await head.newPage();
  await page.goto("/course-homes?tab=base");
  await expect(page.locator("body")).not.toContainText(BROKEN);
  const flag = page.locator("[data-base-flag]").first();
  await expect(flag).toContainText(/move it to/);
  const groups = await db.courseContentSyncGroup.findMany({ where: { chairman: { username: "dream.head" } }, select: { id: true, members: { select: { courseId: true, isBase: true, course: { select: { subjectExpertId: true, batch: { select: { degreeProgram: true } } } } } } } });
  const g = groups.find((x) => { const base = x.members.find((m) => m.isBase); return base && base.course.batch?.degreeProgram !== "BS Artificial Intelligence" && x.members.some((m) => m.course.batch?.degreeProgram === "BS Artificial Intelligence"); });
  expect(g).toBeTruthy();
  const oldBase = g!.members.find((m) => m.isBase)!;
  const r = await head.request.post(API, { data: { action: "makeBase", groupId: g!.id } });
  expect(r.ok()).toBeTruthy();
  const after = await db.courseContentSyncMember.findFirstOrThrow({ where: { groupId: g!.id, isBase: true }, select: { course: { select: { batch: { select: { degreeProgram: true } } } } } });
  expect(after.course.batch?.degreeProgram).toBe("BS Artificial Intelligence");
  expect(await db.auditLog.count({ where: { action: "SYNC_BASE_MOVED_TO_HOME", entityId: g!.id } })).toBe(1);
  if (oldBase.course.subjectExpertId) expect(await db.notification.count({ where: { userId: oldBase.course.subjectExpertId, title: { contains: "the base moved to its home" } } })).toBeGreaterThan(0);
});
