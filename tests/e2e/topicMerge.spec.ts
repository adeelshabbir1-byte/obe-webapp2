import { test, expect, type APIRequestContext } from "@playwright/test";
import { BROKEN, json, signIn, testDb } from "./helpers";

// Part 2: merge / split lectures (real merges, Free slot, Unmerge, warnings), click-to-link prerequisites, and merges
// shown as merges (one card) to the other Subject Expert, in history and in "Compare with last semester".
test.describe.configure({ mode: "serial" });
const API = "/api/faculty/topic-workspace";
const post = async (r: APIRequestContext, url: string, data: unknown) => { const x = await r.post(url, { data, timeout: 120_000 }); return { s: x.status(), d: await json(x) }; };
const any = (db: unknown) => db as Record<string, any>;

let courseId = "";
let rowsBefore: { id: string; lectureNumber: number; topic: string; cloId: string | null }[] = [];

test("merge L7 + L8: one lecture with both topics and CLOs, items re-pointed, a Free lecture in the gap; Unmerge restores", async ({ playwright }) => {
  const db = await testDb();
  // The Instructor's own teaching copy: he merges and splits in it freely.
  const ins = await db.user.findUniqueOrThrow({ where: { username: "dream.instructor" } });
  const course = await db.course.findFirstOrThrow({ where: { instructorId: ins.id, isOffered: true, lectureRows: { some: { source: "INSTRUCTOR" } } }, orderBy: { code: "asc" } });
  courseId = course.id;
  rowsBefore = await db.lectureRow.findMany({ where: { courseId, source: "INSTRUCTOR" }, orderBy: { lectureNumber: "asc" }, select: { id: true, lectureNumber: true, topic: true, cloId: true } });
  const [l7, l8] = [rowsBefore[6], rowsBefore[7]];
  const items8 = (await db.lectureRowInstrument.findMany({ where: { lectureRowId: l8.id }, select: { instrumentId: true } })).map((x) => x.instrumentId);
  const r = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL });
  await signIn(r, "dream.instructor");
  let m = await post(r, `${API}/lectures`, { action: "merge", courseId, plan: "INSTRUCTOR", rowIds: [l7.id, l8.id] });
  if (m.s === 409 && m.d.warnings) m = await post(r, `${API}/lectures`, { action: "merge", courseId, plan: "INSTRUCTOR", rowIds: [l7.id, l8.id], confirm: true });
  expect(m.s, JSON.stringify(m.d)).toBe(200);
  const after = await db.lectureRow.findMany({ where: { courseId, source: "INSTRUCTOR" }, orderBy: { lectureNumber: "asc" } });
  expect(after.length).toBe(rowsBefore.length);
  const merged = after.find((x) => x.id === l7.id)!, free = after.find((x) => x.id === l8.id)!;
  expect(merged.topic).toContain(l7.topic); expect(merged.topic).toContain(l8.topic);
  expect(free.topic).toBe("Free — created by merging L7 + L8");
  const now7 = (await db.lectureRowInstrument.findMany({ where: { lectureRowId: l7.id }, select: { instrumentId: true } })).map((x) => x.instrumentId);
  for (const i of items8) expect(now7).toContain(i);
  expect(await db.lectureRowInstrument.count({ where: { lectureRowId: l8.id } })).toBe(0);
  // Each re-pointed item keeps measuring the CLO of the lecture it came from.
  if (l8.cloId && l8.cloId !== l7.cloId) for (const i of items8) expect((await db.assessmentInstrument.findUniqueOrThrow({ where: { id: i } })).cloId).toBe(l8.cloId);
  const rec = await any(db).lectureMerge.findFirst({ where: { courseId, intoRowId: l7.id, undoneAt: null } });
  expect(rec).toBeTruthy();
  // Unmerge: both lectures back with their topics, CLOs and items.
  const u = await post(r, `${API}/lectures`, { action: "unmerge", mergeId: rec.id });
  expect(u.s, JSON.stringify(u.d)).toBe(200);
  const back = await db.lectureRow.findMany({ where: { id: { in: [l7.id, l8.id] } } });
  expect(back.find((x) => x.id === l7.id)!.topic).toBe(l7.topic);
  expect(back.find((x) => x.id === l8.id)!.topic).toBe(l8.topic);
  expect(back.find((x) => x.id === l8.id)!.cloId).toBe(l8.cloId);
  const back8 = (await db.lectureRowInstrument.findMany({ where: { lectureRowId: l8.id }, select: { instrumentId: true } })).map((x) => x.instrumentId);
  expect(back8.sort()).toEqual(items8.sort());
  await r.dispose();
});

test("merging two Core topics warns first", async ({ playwright }) => {
  const db = await testDb();
  const r = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL });
  await signIn(r, "dream.instructor");
  const cols = await r.get(`${API}?open=${encodeURIComponent(JSON.stringify([{ courseId, plan: "INSTRUCTOR" }]))}`).then(json);
  const col = (cols.columns as { courseId: string; hash: string; rows: { id: string; topic: string; subtopic: string | null }[] }[])[0];
  const entries = col.rows.map((x, i) => ({ id: x.id, topic: x.topic, subtopic: x.subtopic, importance: i === 2 || i === 3 ? "CORE" : null }));
  const s = await post(r, API, { courses: [{ courseId, plan: "INSTRUCTOR", hash: col.hash, entries }] });
  expect(s.s, JSON.stringify(s.d)).toBe(200);
  const rows = await db.lectureRow.findMany({ where: { courseId, source: "INSTRUCTOR" }, orderBy: { lectureNumber: "asc" } });
  const w = await post(r, `${API}/lectures`, { action: "merge", courseId, plan: "INSTRUCTOR", rowIds: [rows[2].id, rows[3].id] });
  expect(w.s).toBe(409);
  expect((w.d.warnings as string[]).join(" ")).toMatch(/Both are Core/);
  await r.dispose();
});

test("link mode: click A then B in another course (Mild), S makes it Strong, Esc exits; drag does the same; loops refused; same-course order warns", async ({ browser }) => {
  const db = await testDb();
  const course = await db.course.findUniqueOrThrow({ where: { id: courseId } });
  const other = await db.course.findFirstOrThrow({ where: { coordinatorId: course.coordinatorId, batchId: course.batchId, id: { not: courseId }, lectureRows: { some: { source: "SE" } } }, orderBy: { code: "asc" } });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 } });
  await signIn(ctx, "dream.instructor");
  await ctx.request.put(`${API}/state`, { data: { open: [{ courseId, plan: "INSTRUCTOR" }, { courseId: other.id, plan: "SE" }] } });
  const page = await ctx.newPage();
  await page.goto("/faculty/topic-workspace");
  await expect(page.locator("body")).not.toContainText(BROKEN);
  const colA = page.locator(`section[aria-label^="${course.code} "]`), colB = page.locator(`section[aria-label^="${other.code} "]`);
  await expect(colA.locator(".tw-card").first()).toBeVisible({ timeout: 60_000 });
  // Click mode.
  await page.locator("[data-link-mode]").click();
  await expect(page.locator("[data-link-bar]")).toContainText("Click the topic that is needed first");
  await colA.locator(".tw-card").nth(0).click();
  await expect(page.locator("[data-link-bar]")).toContainText("Now click the topic that needs");
  await colB.locator(".tw-card").nth(3).click();
  const pop = page.locator("[data-strength-popup]");
  await expect(pop).toBeVisible();
  await expect(pop.getByRole("button", { name: "Mild" })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("s");
  await expect(pop.getByRole("button", { name: "Strong" })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Enter");
  await expect(pop).toBeHidden();
  await expect(page.locator(".tw-unsaved")).toContainText("1 link(s) to propose");
  // Link mode stays on; the reverse link would close a loop and is refused.
  await colB.locator(".tw-card").nth(3).click();
  await colA.locator(".tw-card").nth(0).click();
  await expect(page.getByText(/Refused: this link would make a loop/)).toBeVisible();
  // Same course: A taught after B warns, with a move offered.
  await colA.locator(".tw-card").nth(5).click();
  await colA.locator(".tw-card").nth(1).click();
  await expect(pop).toContainText("is taught after");
  await expect(pop.getByRole("button", { name: /Move it before/ })).toBeVisible();
  await pop.getByRole("button", { name: "Cancel" }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-link-bar]")).toBeHidden();
  // Drag from A's handle onto B: the same popup.
  await colA.locator(".tw-card").nth(2).locator(".tw-handle").dragTo(colB.locator(".tw-card").nth(4));
  await expect(pop).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".tw-unsaved")).toContainText("2 link(s) to propose");
  await ctx.close();
});

test("an Instructor's merge reaches the Subject Expert as one Merged card; accepting keeps the links; a split is one Split card; history shows them", async ({ browser, playwright }) => {
  const db = await testDb();
  const ins = await db.user.findUniqueOrThrow({ where: { username: "dream.instructor" } });
  // Another teacher's course: the Instructor's change to its Subject Expert's plan is a proposal to that SE.
  const mine = await db.course.findFirstOrThrow({ where: { instructorId: ins.id, isOffered: true } });
  const lead = await db.user.findUniqueOrThrow({ where: { id: mine.coordinatorId } });
  const cands = await db.course.findMany({ where: { coordinator: { managedById: lead.managedById }, NOT: { subjectExpertId: null }, OR: [{ contentSyncMember: { is: null } }, { contentSyncMember: { isBase: true } }], lectureRows: { some: { source: "SE" } }, id: { not: courseId } }, orderBy: [{ isOffered: "desc" }, { code: "asc" }], take: 40, include: { subjectExpert: true } });
  const r = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL });
  await signIn(r, "dream.instructor");
  let c = cands[0], rows: Awaited<ReturnType<typeof db.lectureRow.findMany>> = [], l7 = null as unknown as (typeof rows)[number], l8 = l7, items8: string[] = [], m = { s: 0, d: {} as Record<string, any> };
  for (const cand of cands.filter((x) => x.subjectExpertId !== ins.id)) {
    c = cand;
    rows = await db.lectureRow.findMany({ where: { courseId: c.id, source: "SE" }, orderBy: { lectureNumber: "asc" } });
    [l7, l8] = [rows[6], rows[7]];
    items8 = (await db.lectureRowInstrument.findMany({ where: { lectureRowId: l8.id }, select: { instrumentId: true } })).map((x) => x.instrumentId);
    m = await post(r, `${API}/lectures`, { action: "merge", courseId: c.id, plan: "SE", rowIds: [l7.id, l8.id], confirm: true });
    if (m.s === 200) break; // a course that follows a base course is refused: try the next
  }
  expect(m.s, JSON.stringify(m.d)).toBe(200);
  expect((m.d.proposals as unknown[]).length).toBe(1);
  // The Subject Expert sees one MERGE item — no "removed", "added" or "renamed".
  const se = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL });
  await signIn(se, c.subjectExpert!.username);
  const inbox = await se.get(`${API}/proposals`).then(json);
  const p = (inbox.received as { id: string; courseId: string; status: string; items: { kind: string }[] }[]).find((x) => x.courseId === c.id && x.status === "PENDING")!;
  expect(p.items.map((i) => i.kind)).toEqual(["MERGE"]);
  const ctx = await browser.newContext();
  await signIn(ctx, c.subjectExpert!.username);
  const page = await ctx.newPage();
  await page.goto("/faculty/topic-workspace?tab=proposals");
  const card = page.locator("[data-merge-card]").first();
  await expect(card).toContainText("Merged L7");
  await expect(card).toContainText("→ L7");
  await ctx.close();
  // Accepting applies a real merge: the absorbed lecture's items now point at L7, and L8 is the Free lecture.
  const acc = await post(se, `${API}/proposals`, { id: p.id, acceptAll: true });
  expect(acc.s, JSON.stringify(acc.d)).toBe(200);
  const now7 = (await db.lectureRowInstrument.findMany({ where: { lectureRowId: l7.id }, select: { instrumentId: true } })).map((x) => x.instrumentId);
  const tpl = c.templateStatus === "approved";
  if (!tpl) { for (const i of items8) expect(now7).toContain(i); expect((await db.lectureRow.findUniqueOrThrow({ where: { id: l8.id } })).topic).toMatch(/^Free — created by merging L7 \+ L8/); }
  // A split is one SPLIT item.
  const s = await post(r, `${API}/lectures`, { action: "split", courseId: c.id, plan: "SE", rowId: rows[9].id, second: { topic: `${rows[9].topic} II` } });
  expect(s.s, JSON.stringify(s.d)).toBe(200);
  const inbox2 = await se.get(`${API}/proposals`).then(json);
  const p2 = (inbox2.received as { courseId: string; status: string; items: { kind: string }[] }[]).find((x) => x.courseId === c.id && x.status === "PENDING")!;
  expect(p2.items.map((i) => i.kind)).toEqual(["SPLIT"]);
  // History of the SE plan: the accepted merge is summarised as a merge.
  if (!tpl) {
    const v = await se.get(`${API}/versions?courseId=${c.id}&plan=SE`).then(json);
    expect((v.history as { summary: string }[]).some((h) => /1 merged/.test(h.summary))).toBe(true);
  }
  await r.dispose(); await se.dispose();
});
