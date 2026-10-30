import { test, expect, type Browser } from "@playwright/test";
import { BROKEN, json, signIn, testDb } from "./helpers";

// Smart scheduling: free slots; a move goes Dean → Program Lead + teacher; a visiting teacher who can't come blocks it;
// blackout weeks refused; planned events flag clashing classes; force majeure moves a closed day's classes.
test.describe.configure({ mode: "serial" });
const as = async (browser: Browser, u: string) => { const c = await browser.newContext(); await signIn(c, u); return c; };
const API = "/api/scheduling";
let t3Entry = "", t4Entry = "", batchId = "";

test.beforeAll(async () => {
  // Test set-up: a small published timetable for the demo institute (the solver itself is covered by journeys.spec).
  const db = await testDb();
  const head = await db.user.findFirstOrThrow({ where: { username: "dream.head" }, select: { id: true } });
  const room = await db.room.findFirstOrThrow({ where: { chairmanId: head.id } }).catch(() => db.room.findFirstOrThrow());
  const sec = async (u: string) => db.scheduleSection.findFirstOrThrow({ where: { instructor: { username: u }, course: { isOffered: true } }, select: { id: true, course: { select: { batchId: true } } } });
  const [s3, s4] = [await sec("dream.t3"), await sec("dream.t4")];
  batchId = s3.course!.batchId!;
  const run = await db.timetableRun.create({ data: { chairmanId: head.id, generatedById: head.id, status: "COMPLETED", scopeKey: "E2E" } });
  t3Entry = (await db.timetableEntry.create({ data: { timetableRunId: run.id, scheduleSectionId: s3.id, roomId: room.id, dayOfWeek: "Monday", startHour: 8, endHour: 9.5 } })).id;
  t4Entry = (await db.timetableEntry.create({ data: { timetableRunId: run.id, scheduleSectionId: s4.id, roomId: room.id, dayOfWeek: "Monday", startHour: 10, endHour: 11.5 } })).id;
  const t4 = await db.user.findFirstOrThrow({ where: { username: "dream.t4" }, select: { id: true } });
  await db.facultyProfile.upsert({ where: { userId: t4.id }, create: { userId: t4.id, employmentType: "Visiting" }, update: { employmentType: "Visiting" } });
});

test("free slots and the least-disruptive times for a batch", async ({ browser }) => {
  const pl = await as(browser, "dream.lead.cs");
  const free = await json(await pl.request.post(API, { data: { action: "slots", batchIds: [batchId], days: ["Mon"], from: "08:00", to: "12:00", length: 1 } }));
  expect(free.slots.some((s: { start: number }) => s.start === 8)).toBe(false);
  expect(free.slots.some((s: { start: number }) => s.start === 9.5)).toBe(false);
  const ranked = await json(await pl.request.post(API, { data: { action: "slots", batchIds: [batchId], days: ["Mon"], from: "08:00", to: "12:00", length: 2, rank: true } }));
  expect(ranked.slots[0].affected.length).toBeLessThanOrEqual(ranked.slots[ranked.slots.length - 1].affected.length);
  const page = await pl.newPage();
  await page.goto("/scheduling");
  await expect(page.locator("body")).not.toContainText(BROKEN);
  await expect(page.getByTestId("slot-finder")).toBeVisible();
});

test("a move: Dean → Program Lead + teacher; a visiting teacher who can't come blocks it", async ({ browser }) => {
  const db = await testDb();
  const t3c = await as(browser, "dream.t3"), head = await as(browser, "dream.head");
  const id = (await json(await t3c.request.post(API, { data: { action: "request", entryId: t3Entry, fromDate: "2026-11-02", toDate: "2026-11-04", toStart: "15:00", reason: "Seminar in the hall" } }))).id;
  expect(id).toBeTruthy();
  expect((await json(await t3c.request.post(API, { data: { action: "decide", id, ok: true } }))).error).toMatch(/Dean reviews it first/);
  expect((await head.request.post(API, { data: { action: "decide", id, ok: true } })).ok()).toBeTruthy();
  const r = await db.classReschedule.findUniqueOrThrow({ where: { id } });
  expect(r.status).toBe("PROVISIONAL");
  const course = await db.course.findUniqueOrThrow({ where: { id: r.courseId }, select: { coordinator: { select: { username: true } } } });
  const pl = await as(browser, course.coordinator.username!);
  expect((await pl.request.post(API, { data: { action: "decide", id, ok: true } })).ok()).toBeTruthy();
  expect((await t3c.request.post(API, { data: { action: "decide", id, ok: true } })).ok()).toBeTruthy();
  expect((await db.classReschedule.findUniqueOrThrow({ where: { id } })).status).toBe("APPROVED");
  // Visiting teacher: not available → blocked.
  const t4c = await as(browser, "dream.t4");
  const vid = (await json(await head.request.post(API, { data: { action: "request", entryId: t4Entry, fromDate: "2026-11-02", toDate: "2026-11-05", toStart: "14:00", reason: "Convocation rehearsal" } }))).id;
  expect((await db.classReschedule.findUniqueOrThrow({ where: { id: vid } })).visiting).toBe(true);
  await head.request.post(API, { data: { action: "decide", id: vid, ok: true } });
  const no = await json(await t4c.request.post(API, { data: { action: "decide", id: vid, ok: false, note: "I teach elsewhere on Thursdays" } }));
  expect(no.message).toMatch(/blocked/);
  expect((await db.classReschedule.findUniqueOrThrow({ where: { id: vid } })).status).toBe("BLOCKED");
  const page = await head.newPage();
  await page.goto("/scheduling?tab=requests");
  await expect(page.getByText("Blocked — visiting teacher unavailable")).toBeVisible();
});

test("blackout: no move into the week before the midterms", async ({ browser }) => {
  const db = await testDb();
  const entry = await db.timetableEntry.findUniqueOrThrow({ where: { id: t3Entry }, select: { scheduleSection: { select: { course: { select: { coordinatorId: true, offeredTermName: true, offeredTermYear: true, batch: { select: { degreeProgram: true } } } } } } } });
  const c = entry.scheduleSection.course!;
  await db.semesterDates.upsert({ where: { coordinatorId_degreeProgram_termName_termYear: { coordinatorId: c.coordinatorId, degreeProgram: c.batch!.degreeProgram, termName: c.offeredTermName || "Fall", termYear: c.offeredTermYear || 2026 } }, create: { coordinatorId: c.coordinatorId, degreeProgram: c.batch!.degreeProgram, termName: c.offeredTermName || "Fall", termYear: c.offeredTermYear || 2026, midtermStartDate: new Date("2026-11-23"), finalStartDate: new Date("2027-01-18") }, update: { midtermStartDate: new Date("2026-11-23"), finalStartDate: new Date("2027-01-18") } });
  const t3c = await as(browser, "dream.t3");
  const r = await json(await t3c.request.post(API, { data: { action: "request", entryId: t3Entry, fromDate: "2026-11-09", toDate: "2026-11-18", toStart: "15:00", reason: "Guest lecture" } }));
  expect(r.error).toMatch(/week before the midterms/);
});

test("events flag clashing classes; force majeure moves a closed day's classes", async ({ browser }) => {
  const db = await testDb();
  const head = await as(browser, "dream.head");
  expect((await head.request.post(API, { data: { action: "event", title: "Convocation", date: "2026-11-16", start: "09:00", end: "12:00", batchIds: "" } })).ok()).toBeTruthy();
  const page = await head.newPage();
  await page.goto("/scheduling?tab=events");
  await expect(page.locator("[data-conflict]").first()).toContainText("Convocation");
  const t3c = await as(browser, "dream.t3");
  expect((await t3c.request.post(API, { data: { action: "closure", date: "2026-11-09", reason: "Rain emergency" } })).status()).toBe(400);
  const r = await json(await head.request.post(API, { data: { action: "closure", date: "2026-11-09", reason: "Rain emergency" } }));
  expect(r.message).toMatch(/^2 class\(es\) moved/);
  const moved = await db.classReschedule.findMany({ where: { forceMajeure: true, fromDate: new Date("2026-11-09T00:00:00Z") } });
  expect(moved.length).toBe(2);
  expect(moved.every((m) => m.status === "APPROVED")).toBe(true);
  await page.goto("/scheduling?tab=cohort");
  await expect(page.locator("body")).not.toContainText(BROKEN);
  await page.goto("/scheduling?tab=cqi");
  await expect(page.locator("body")).not.toContainText(BROKEN);
});
