import { test, expect, type APIRequestContext } from "@playwright/test";
import { BROKEN, json, signIn, testDb } from "./helpers";

// Part 5: official content into QR-I, QR-II and Discrete Structures (base courses), IDS-D01 retired, the previous plan
// restorable, an approved plan → change request, the three opened side by side in the Topic Workspace.
test.describe.configure({ mode: "serial" });
const any = (db: unknown) => db as Record<string, any>;
const API = "/api/admin/official-content";
const post = async (r: APIRequestContext, data: unknown) => { const x = await r.post(API, { data, timeout: 180_000 }); return { s: x.status(), d: await json(x) }; };
const ctx = async (playwright: { request: { newContext: (o: { baseURL?: string }) => Promise<APIRequestContext> } }, username: string) => { const r = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL }); await signIn(r, username); return r; };

const OUTLINE = `# HEC Quantitative Reasoning resource package

## Course I — Exploring Quantitative Skills

| Week | Module | Goal | Topics |
|---|---|---|---|
| 1 | Module 1: Numbers in everyday life | Number sense | Types of numbers; Place value and rounding |
| 2 | | | Ratios; Proportions; Percentages |
| 3 | Module 2: Data | Read data | Tables and charts; Misleading graphs |

## Course II — Tools for Quantitative Reasoning

| Week | Module | Topics |
|---|---|---|
| 1 | Module 1: Models | Linear models; Exponential models |
| 2 | | Matrices |
`;

test("official content: Discrete Structures from GE116 (31 lectures, CLO tags), followers synced, IDS-D01 hidden, restorable; QR-I from the HEC outline; approved QR-II → change request; workspace link", async ({ playwright, browser }) => {
  const db = await testDb();
  const head = await db.user.findUniqueOrThrow({ where: { username: "dream.head" } });
  const lead = await db.user.findUniqueOrThrow({ where: { username: "dream.lead.cs" } });
  const stamp = Date.now().toString(36);
  const catalogBefore = new Map(((await any(db).catalogCourse.findMany({ select: { id: true, version: true } })) as { id: string; version: number }[]).map((c) => [c.id, c.version]));

  // Fixtures: the master curriculum with GE116 (31 lectures, CLO tags, no CLO statements), GE117 / GE118 (CLOs), and
  // the system-generated IDS-D01; a Discrete Structures base course with a follower, a course adopted from IDS-D01,
  // a QR-I course and an approved QR-II course.
  const mc = await db.masterCurriculum.create({ data: { authority: "HEC", title: `BS Computer Science (e2e ${stamp})`, version: "2025", status: "PUBLISHED", chairmanId: head.id } as never });
  const ge116 = await db.masterCourse.create({ data: { masterCurriculumId: mc.id, code: "GE116", title: "Discrete Structures", creditHours: 3, category: "General Education", semesterNumber: 2 } });
  await db.masterCourseTopic.createMany({ data: Array.from({ length: 31 }, (_, i) => ({ masterCourseId: ge116.id, lectureNumber: i + 1, topic: i === 16 ? "Midterm" : `DS topic ${i + 1} ${stamp}`, subtopic: i === 16 ? null : `DS sub ${i + 1} [CLO${(i % 3) + 1}]` })) });
  const qr: Record<string, string> = {};
  for (const [code, title] of [["GE117", "Quantitative Reasoning-I"], ["GE118", "Quantitative Reasoning-II"]]) {
    const m = await db.masterCourse.create({ data: { masterCurriculumId: mc.id, code, title, creditHours: 3, category: "General Education", semesterNumber: code === "GE117" ? 1 : 2 } });
    await db.masterCourseClo.createMany({ data: [1, 2, 3].map((n) => ({ masterCourseId: m.id, statement: `${code} official CLO ${n}`, bloomLevel: `C${n + 1}`, orderIndex: n - 1 })) });
    qr[code] = m.id;
  }
  const dup = await db.masterCourse.create({ data: { masterCurriculumId: mc.id, code: "IDS-D01", title: "Discrete Structures", creditHours: 3, category: "IDS" } });
  const mk = (code: string, title: string, extra: Record<string, unknown> = {}) => db.course.create({ data: { code: `${code}-${stamp}`, title, creditHours: 3, coordinatorId: lead.id, ...extra } as never });
  const base = await mk("E2E-DS", "Discrete Structures"), follower = await mk("E2E-DSF", "Discrete Structures"), adopted = await mk("E2E-DSD", "Discrete Structures", { masterCourseId: dup.id });
  const qr1 = await mk("E2E-QR1", "Quantitative Reasoning-I"), qr2 = await mk("E2E-QR2", "Quantitative Reasoning-II", { templateStatus: "approved" });
  const courses = [base, follower, adopted, qr1, qr2];
  const group = await db.courseContentSyncGroup.create({ data: { chairmanId: head.id, name: `E2E DS ${stamp}`, needsSync: false } });
  await db.courseContentSyncMember.createMany({ data: [{ groupId: group.id, courseId: base.id, isBase: true }, { groupId: group.id, courseId: follower.id, isBase: false }] });
  for (const c of [base, qr2]) for (let n = 1; n <= 5; n++) await db.lectureRow.create({ data: { courseId: c.id, source: "SE", week: n, lectureNumber: n, topic: `Old topic ${n}` } });

  const su = await ctx(playwright, "e2e.super"), pl = await ctx(playwright, "dream.lead.cs"), se = await ctx(playwright, "dream.se");
  const found = async () => (((await json(await pl.get(`/api/coordinator/batch-setup?search=IDS-D01&batchId=none`))).results || []) as { id: string }[]).some((r) => r.id === dup.id);
  try {
    expect(await found(), "IDS-D01 is listed before it is retired").toBe(true);

    // Discrete Structures: preview, then load into the base course.
    const pv = await post(su, { action: "preview", chairmanId: head.id, kind: "DS", courseId: base.id });
    expect(pv.s, JSON.stringify(pv.d)).toBe(200);
    expect(pv.d.plan.lectures).toHaveLength(31);
    expect(pv.d.plan.missing.join(" ")).toMatch(/CLO statements .*placeholders/);
    expect((await post(su, { action: "load", chairmanId: head.id, kind: "DS", courseId: follower.id })).d.error).toMatch(/base course/);
    const ld = await post(su, { action: "load", chairmanId: head.id, kind: "DS", courseId: base.id });
    expect(ld.s, JSON.stringify(ld.d)).toBe(200);
    expect(ld.d.applied).toBe(true);
    const rows = await db.lectureRow.findMany({ where: { courseId: base.id, source: "SE" }, orderBy: { lectureNumber: "asc" }, include: { clo: { select: { code: true } } } });
    expect(rows).toHaveLength(31);
    expect(rows[0].topic).toBe(`DS topic 1 ${stamp}`); expect(rows[0].subtopic).toBe("DS sub 1 [CLO1]"); expect(rows[0].clo?.code).toBe("CLO-1");
    expect(rows[1].clo?.code).toBe("CLO-2"); expect(rows[2].clo?.code).toBe("CLO-3");
    expect(rows[16].topic).toBe("Midterm"); expect(rows[16].cloId).toBeNull();
    expect((await db.cLO.findMany({ where: { courseId: base.id, source: "SE" }, orderBy: { code: "asc" } })).map((c) => c.code)).toEqual(["CLO-1", "CLO-2", "CLO-3"]);
    // The follower and the course adopted from IDS-D01 show the same plan; IDS-D01 is retired and hidden.
    for (const c of [follower, adopted]) {
      const fr = await db.lectureRow.findMany({ where: { courseId: c.id, source: "SE" }, orderBy: { lectureNumber: "asc" } });
      expect(fr.map((r) => r.topic), c.code).toEqual(rows.map((r) => r.topic));
    }
    expect((await db.course.findUniqueOrThrow({ where: { id: adopted.id } })).masterCourseId).toBe(ge116.id);
    expect(await any(db).masterCourseRetired.findUnique({ where: { masterCourseId: dup.id } })).toBeTruthy();
    expect(await db.masterCourse.findUnique({ where: { id: dup.id } }), "kept in the history").toBeTruthy();
    expect(await found(), "IDS-D01 hidden from pickers").toBe(false);

    // QR-I from the HEC outline: GE117's CLOs, 32 lectures in weekly order, split lectures say so.
    const q1 = await post(su, { action: "load", chairmanId: head.id, kind: "QR1", courseId: qr1.id, outline: OUTLINE });
    expect(q1.s, JSON.stringify(q1.d)).toBe(200);
    const qrows = await db.lectureRow.findMany({ where: { courseId: qr1.id, source: "SE" }, orderBy: { lectureNumber: "asc" } });
    expect(qrows).toHaveLength(32);
    expect(qrows[0].topic).toMatch(/^Types of numbers/);
    expect(qrows.some((r) => /split from /.test(r.subtopic || ""))).toBe(true);
    expect(qrows.some((r) => /Exponential|Matrices/.test(r.topic)), "Course II topics stay out of Course I").toBe(false);
    expect((await db.cLO.findMany({ where: { courseId: qr1.id, source: "SE" }, orderBy: { code: "asc" } })).map((c) => c.statement)).toEqual(["GE117 official CLO 1", "GE117 official CLO 2", "GE117 official CLO 3"]);
    const cat = (await any(db).catalogCourse.findMany({ where: { title: { contains: "Quantitative Reasoning", mode: "insensitive" } } })) as { closJson: string; lecturesJson: string; instituteCodesJson: string }[];
    const qcat = cat.find((c) => c.instituteCodesJson.includes("GE117"));
    expect(qcat, "QR-I in the Course Catalog").toBeTruthy();
    expect(JSON.parse(qcat!.closJson).map((c: { statement: string }) => c.statement)).toContain("GE117 official CLO 1");
    expect(JSON.parse(qcat!.lecturesJson)).toHaveLength(32);

    // QR-II is OMC-approved: a change request, not an overwrite.
    const q2 = await post(su, { action: "load", chairmanId: head.id, kind: "QR2", courseId: qr2.id, outline: OUTLINE });
    expect(q2.s, JSON.stringify(q2.d)).toBe(200);
    expect(q2.d.requested).toBe(true);
    expect(await db.templateChangeRequest.count({ where: { courseId: qr2.id, status: "pending" } })).toBe(1);
    expect((await db.lectureRow.findMany({ where: { courseId: qr2.id, source: "SE" }, orderBy: { lectureNumber: "asc" } })).map((r) => r.topic)).toEqual([1, 2, 3, 4, 5].map((n) => `Old topic ${n}`));

    // The workspace link opens the three side by side.
    const page = await (await browser.newContext()).newPage();
    await signIn(page.context(), "dream.se");
    await page.goto(`/faculty/topic-workspace?open=${[qr1.id, qr2.id, base.id].join(",")}`);
    await expect(page.locator(".tw-col")).toHaveCount(3, { timeout: 30_000 });
    await page.context().close();

    // The Platform page: the three courses with their source and what is missing; the loads with Restore.
    const ap = await (await browser.newContext()).newPage();
    await signIn(ap.context(), "e2e.super");
    await ap.goto("/admin/official-content");
    await expect(ap.locator("body")).not.toContainText(BROKEN);
    await ap.locator("[data-institute]").selectOption(head.id);
    await expect(ap.locator("[data-kind]")).toHaveCount(3, { timeout: 30_000 });
    await expect(ap.locator('[data-kind="QR1"] [data-missing]')).toContainText("HEC QR course outline");
    await expect(ap.locator('[data-load-row="DS"][data-status="APPLIED"] [data-undo]')).toBeVisible();
    await expect(ap.locator("[data-workspace-link]")).toBeVisible();
    await ap.context().close();

    // The previous Discrete Structures plan is restored.
    const loads = (await json(await su.get(`${API}?chairmanId=${head.id}`))).loads as { id: string; courseId: string; status: string }[];
    const dsLoad = loads.find((l) => l.courseId === base.id && l.status === "APPLIED")!;
    const un = await post(su, { action: "undo", id: dsLoad.id });
    expect(un.s, JSON.stringify(un.d)).toBe(200);
    expect((await db.lectureRow.findMany({ where: { courseId: base.id, source: "SE" }, orderBy: { lectureNumber: "asc" } })).map((r) => r.topic)).toEqual([1, 2, 3, 4, 5].map((n) => `Old topic ${n}`));
  } finally {
    // Clean up: fixture courses, master courses, retired marker, catalog back to its versions before the test.
    for (const c of [su, pl, se]) await c.dispose();
    const ids = courses.map((c) => c.id);
    const rowIds = (await db.lectureRow.findMany({ where: { courseId: { in: ids } }, select: { id: true } })).map((r) => r.id);
    await db.lectureRowInstrument.deleteMany({ where: { lectureRowId: { in: rowIds } } });
    await any(db).topicMeta.deleteMany({ where: { lectureRowId: { in: rowIds } } });
    await db.paperDistributionItem.deleteMany({ where: { courseId: { in: ids } } });
    await db.lectureRow.deleteMany({ where: { courseId: { in: ids } } });
    await db.cLO.deleteMany({ where: { courseId: { in: ids } } });
    await db.templateChangeRequest.deleteMany({ where: { courseId: { in: ids } } });
    await any(db).officialContentLoad.deleteMany({ where: { courseId: { in: ids } } });
    await db.courseContentSyncMember.deleteMany({ where: { courseId: { in: ids } } });
    const groups = (await db.courseContentSyncGroup.findMany({ where: { members: { none: {} } }, select: { id: true } })).map((g) => g.id);
    await db.courseContentSyncGroup.deleteMany({ where: { id: { in: groups } } });
    await db.course.deleteMany({ where: { id: { in: ids } } }).catch(async (e) => { console.warn("course cleanup:", (e as Error).message); });
    await any(db).masterCourseRetired.deleteMany({ where: { masterCourseId: dup.id } });
    const mIds = [ge116.id, dup.id, ...Object.values(qr)];
    await db.course.updateMany({ where: { masterCourseId: { in: mIds } }, data: { masterCourseId: null } });
    await db.masterCourseTopic.deleteMany({ where: { masterCourseId: { in: mIds } } });
    await db.masterCourseClo.deleteMany({ where: { masterCourseId: { in: mIds } } });
    await db.masterCourse.deleteMany({ where: { id: { in: mIds } } });
    await db.masterCurriculum.delete({ where: { id: mc.id } });
    for (const c of (await any(db).catalogCourse.findMany({ select: { id: true, version: true } })) as { id: string; version: number }[]) {
      const was = catalogBefore.get(c.id);
      if (was === undefined) { await any(db).catalogVersion.deleteMany({ where: { catalogId: c.id } }); await any(db).catalogCourse.delete({ where: { id: c.id } }); continue; }
      if (c.version === was) continue;
      const v = await any(db).catalogVersion.findFirst({ where: { catalogId: c.id, version: was } });
      if (v) await any(db).catalogCourse.update({ where: { id: c.id }, data: { ...JSON.parse(v.dataJson), version: was } });
      await any(db).catalogVersion.deleteMany({ where: { catalogId: c.id, version: { gt: was } } });
    }
  }
});
