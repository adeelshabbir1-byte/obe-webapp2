import { test, expect, type Browser } from "@playwright/test";
import { BROKEN, json, signIn, testDb } from "./helpers";

// Prompt 10 A: follower courses open the base instead; a merge proposal shows as MERGE; the topic panel follows clicks;
// resetting the semester offering removes only this term's data and a restore brings it back.
test.describe.configure({ mode: "serial" });
const as = async (browser: Browser, u: string) => { const c = await browser.newContext(); await signIn(c, u); return c; };
const API = "/api/faculty/topic-workspace";

test("a follower course can't be edited and opens its base instead", async ({ browser }) => {
  const db = await testDb();
  const f = await db.courseContentSyncMember.findFirstOrThrow({ where: { isBase: false }, select: { courseId: true, groupId: true } });
  const base = await db.courseContentSyncMember.findFirstOrThrow({ where: { groupId: f.groupId, isBase: true }, select: { courseId: true } });
  const se = await as(browser, "dream.se");
  const cols = (await json(await se.request.get(`${API}?open=${encodeURIComponent(JSON.stringify([{ courseId: f.courseId }]))}`))).columns;
  expect(cols[0].mode).toBe("FOLLOWER");
  expect(cols[0].baseCourseId).toBe(base.courseId);
  const save = await se.request.post(API, { data: { courses: [{ courseId: f.courseId, hash: cols[0].hash, entries: cols[0].rows.slice(1).map((r: { id: string; topic: string }) => ({ id: r.id, topic: r.topic, subtopic: null })) }] } });
  expect(save.status()).toBe(409);
  expect((await json(save)).error).toMatch(/follows .* edit the base course/i);
  await se.request.put(`${API}/state`, { data: { open: [{ courseId: f.courseId }] } });
  const page = await se.newPage();
  await page.goto("/faculty/topic-workspace");
  await expect(page.getByText(/Follows .* edit the base so the change carries forward/)).toBeVisible();
  await expect(page.locator(".tw-add")).toHaveCount(0);
  await page.getByRole("button", { name: "Open the base course instead" }).click();
  await expect(page.locator(".tw-col")).toHaveCount(1);
  await expect(page.locator(".tw-mode-FOLLOWER")).toHaveCount(0);
  const st = await json(await se.request.get(`${API}/state`));
  expect(st.open.map((o: { courseId: string }) => o.courseId)).toEqual([base.courseId]);
});

test("a merge proposal shows as MERGE (Merged L5 + L6 → L5)", async ({ browser }) => {
  const db = await testDb();
  // A course of another Subject Expert (not synced), whose plan dream.se can only propose changes to.
  const course = await db.course.findFirstOrThrow({ where: { batch: { degreeProgram: { in: ["BS Computer Science", "BS Artificial Intelligence"] } }, subjectExpert: { username: { startsWith: "dream.", notIn: ["dream.se"] } }, OR: [{ contentSyncMember: null }, { contentSyncMember: { isBase: true } }], lectureRows: { some: { source: "SE", lectureNumber: 8 } } }, select: { id: true, subjectExpert: { select: { username: true } } } });
  const owner = course.subjectExpert!.username;
  const se = await as(browser, "dream.se");
  const [col] = (await json(await se.request.get(`${API}?open=${encodeURIComponent(JSON.stringify([{ courseId: course.id }]))}`))).columns;
  expect(col.mode).toBe("PROPOSE");
  const rows = col.rows as { id: string; topic: string }[];
  const entries = rows.map((r) => ({ id: r.id, topic: r.topic, subtopic: null as string | null, mergedFrom: null as string[] | null })).filter((_, i) => i !== 5);
  entries[4] = { ...entries[4], topic: `${rows[4].topic}; ${rows[5].topic}`, mergedFrom: [rows[4].id, rows[5].id] };
  const save = await se.request.post(API, { data: { sessionId: "e2e-merge", courses: [{ courseId: course.id, plan: "SE", hash: col.hash, entries }] } });
  expect(save.status(), await save.text()).toBe(200);
  const t3 = await as(browser, owner);
  const inbox = await json(await t3.request.get(`${API}/proposals`));
  const p = inbox.received.find((x: { courseId: string; status: string }) => x.courseId === course.id && x.status === "PENDING");
  expect(p.items.map((i: { kind: string }) => i.kind)).toEqual(["MERGE"]);
  expect(p.items[0].line).toMatch(/^Merged L5 \+ L6 → L5/);
  const page = await t3.newPage();
  await page.goto("/faculty/topic-workspace?tab=proposals");
  await expect(page.locator("body")).not.toContainText(BROKEN);
  await expect(page.getByText("1 merged").first()).toBeVisible();
  await expect(page.getByText(/Merged L5 \+ L6 → L5/).first()).toBeVisible();
  await expect(page.getByText("merged into L5").first()).toBeVisible();
});

test("clicking another topic switches the topic panel (no need to press … again); Esc closes it", async ({ browser }) => {
  const db = await testDb();
  const course = await db.course.findFirstOrThrow({ where: { subjectExpert: { username: "dream.se" }, batch: { batchName: "BSCS Fall 2024" }, semesterNumber: 7 }, select: { id: true } });
  const rows = await db.lectureRow.findMany({ where: { courseId: course.id, source: "SE" }, orderBy: { lectureNumber: "asc" }, select: { topic: true }, take: 3 });
  const se = await as(browser, "dream.se");
  await se.request.put(`${API}/state`, { data: { open: [{ courseId: course.id }] } });
  const page = await se.newPage();
  await page.goto("/faculty/topic-workspace");
  await expect(page.locator(".tw-card").first()).toBeVisible();
  await expect(page.locator(".tw-card").nth(2).locator(".tw-ln")).toHaveText("L3");
  await page.locator(".tw-card").first().locator(".tw-more").click();
  const topicBox = page.locator(".tw-drawer").getByLabel("Topic", { exact: true });
  await expect(topicBox).toHaveValue(rows[0].topic);
  await page.locator(".tw-card").nth(2).locator(".tw-body").click();
  await expect(topicBox).toHaveValue(rows[2].topic);
  await page.keyboard.press("Escape");
  await expect(page.locator(".tw-drawer")).toHaveCount(0);
});

test("reset this semester's offering removes only this term's data; restore within 7 days brings it back", async ({ browser }) => {
  const db = await testDb();
  const lead = await db.user.findUniqueOrThrow({ where: { username: "dream.lead.ai" } });
  const other = await db.user.findUniqueOrThrow({ where: { username: "dream.lead.cs" } });
  const term = await db.currentTerm.findUniqueOrThrow({ where: { coordinatorId: lead.id } });
  const mine = { coordinatorId: lead.id, isOffered: true, offeredTermName: term.termName, offeredTermYear: term.year };
  const earlier = await db.course.count({ where: { coordinatorId: lead.id, isOffered: true, NOT: { offeredTermName: term.termName, offeredTermYear: term.year } } });
  const ids = (await db.course.findMany({ where: mine, select: { id: true } })).map((c) => c.id);
  const before = {
    offered: ids.length, enrol: await db.studentEnrollment.count({ where: { courseId: { in: ids } } }), marks: await db.studentMark.count({ where: { courseId: { in: ids } } }),
    att: await db.attendanceRecord.count({ where: { courseId: { in: ids } } }), rows: await db.lectureRow.count({ where: { courseId: { in: ids } } }), clos: await db.cLO.count({ where: { courseId: { in: ids } } }),
    otherMarks: await db.studentMark.count({ where: { course: { coordinatorId: other.id } } }),
  };
  expect(before.offered).toBeGreaterThan(0);
  const pl = await as(browser, "dream.lead.ai");
  const prev = await json(await pl.request.get("/api/coordinator/semester-reset"));
  expect(prev.preview.counts.offeredCourses).toBe(before.offered);
  expect(prev.preview.counts.marks).toBe(before.marks);
  const wrong = await pl.request.post("/api/coordinator/semester-reset", { data: { confirm: "yes" } });
  expect(wrong.status()).toBe(400);
  const page = await pl.newPage();
  await page.goto("/coordinator/semester");
  await page.getByRole("button", { name: "Reset this semester's offering" }).click();
  await expect(page.getByText("Do you want to lose this semester's data?")).toBeVisible();
  await page.getByLabel("Type the term name to confirm").fill(prev.preview.confirmWord);
  await page.getByRole("button", { name: "Yes, reset it" }).click();
  await expect(page.getByText(/The offering was reset/)).toBeVisible({ timeout: 60_000 });
  expect(await db.course.count({ where: mine })).toBe(0);
  expect(await db.course.count({ where: { coordinatorId: lead.id, isOffered: true } })).toBe(earlier); // earlier terms untouched
  expect(await db.studentEnrollment.count({ where: { courseId: { in: ids } } })).toBe(0);
  expect(await db.studentMark.count({ where: { courseId: { in: ids } } })).toBe(0);
  expect(await db.attendanceRecord.count({ where: { courseId: { in: ids } } })).toBe(0);
  expect(await db.lectureRow.count({ where: { courseId: { in: ids } } })).toBe(before.rows); // plans stay
  expect(await db.cLO.count({ where: { courseId: { in: ids } } })).toBe(before.clos);
  expect(await db.studentMark.count({ where: { course: { coordinatorId: other.id } } })).toBe(before.otherMarks); // other programs untouched
  expect(await db.auditLog.count({ where: { action: "SEMESTER_OFFERING_RESET", actorUserId: lead.id } })).toBeGreaterThan(0);
  await page.getByRole("button", { name: /^Restore/ }).click();
  await expect(page.getByText(/Restored/)).toBeVisible({ timeout: 60_000 });
  expect(await db.course.count({ where: mine })).toBe(before.offered);
  expect(await db.studentEnrollment.count({ where: { courseId: { in: ids } } })).toBe(before.enrol);
  expect(await db.studentMark.count({ where: { courseId: { in: ids } } })).toBe(before.marks);
  expect(await db.attendanceRecord.count({ where: { courseId: { in: ids } } })).toBe(before.att);
});
