import { test, expect, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "crypto";
import JSZip from "jszip";
import { BROKEN, json, signIn, testDb } from "./helpers";

// Part 6 build C: paper templates by the Controller (a CS department variant overrides the institute's for CS courses
// only), fields filled automatically (an edited date is logged), exports keep the template; a locked final can't be
// opened by its teacher, the Controller's download is watermarked and logged, a PL or Controller merely opening it is
// logged and the teacher told, the log can't be changed; the bank readiness warning.
test.describe.configure({ mode: "serial" });
const any = (db: unknown) => db as Record<string, any>;
const ctx = async (playwright: { request: { newContext: (o: { baseURL?: string }) => Promise<APIRequestContext> } }, u: string) => { const r = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL }); await signIn(r, u); return r; };
let F: { stamp: string; cs: string; other: string; dep: string; papers: string[]; items: string[]; ctrl: string; before: string[] };

test.beforeAll(async () => {
  const db = await testDb();
  const u = (n: string) => db.user.findUniqueOrThrow({ where: { username: n } });
  const [head, lead, ins, se, ctrl] = await Promise.all([u("dream.head"), u("dream.lead.cs"), u("dream.instructor"), u("dream.se"), u("dream.t10")]);
  const stamp = Date.now().toString(36);
  const before = ctrl.extraRoles || [];
  await db.user.update({ where: { id: ctrl.id }, data: { extraRoles: Array.from(new Set(before.concat("EXAM_CONTROLLER"))) } });
  const dep = await db.department.create({ data: { chairmanId: head.id, name: `E2E Management ${stamp}` } });
  const mk = (code: string, extra: Record<string, unknown> = {}) => db.course.create({ data: { code, title: `Templates ${code}`, creditHours: 3, coordinatorId: lead.id, instructorId: ins.id, subjectExpertId: se.id, isOffered: true, ...extra } as never });
  const cs = await mk(`TPL-CS-${stamp}`), other = await mk(`TPL-MG-${stamp}`, { subjectHomeDepartmentId: dep.id });
  const items: string[] = []; const papers: string[] = [];
  for (const c of [cs, other]) {
    for (let n = 1; n <= 2; n++) await db.cLO.create({ data: { courseId: c.id, source: "SE", code: `CLO-${n}`, statement: `CLO ${n}`, bloomLevel: "C2", orderIndex: n - 1 } });
    const ids: string[] = [];
    for (const [type, text] of [["MCQ", "Which is LIFO?"], ["SHORT", "Define a queue."], ["LONG", "Compare stacks and queues with $O(1)$ operations."]] as const) {
      const id = randomUUID(); ids.push(id); items.push(id);
      await any(db).questionBankItem.create({ data: { id, chairmanId: head.id, courseCode: c.code, cloCode: "CLO-1", bloom: "C2", kind: type, marks: type === "LONG" ? 10 : 2, text: `${text} (${stamp})`, createdById: ins.id } });
      await any(db).qbMeta.create({ data: { itemId: id, difficulty: "MEDIUM", cloCodesJson: '["CLO-1"]', optionsJson: type === "MCQ" ? '["Queue","Stack"]' : null, correctIndex: type === "MCQ" ? 1 : null } });
      await any(db).qbExt.create({ data: { itemId: id, baseCourseId: c.id, type, status: "APPROVED", visibility: "COURSE" } });
    }
    const pid = randomUUID(); papers.push(pid);
    await any(db).qbPaper.create({ data: { id: pid, courseId: c.id, examType: "Final", termLabel: "Fall 2026", itemIdsJson: JSON.stringify(ids), optsJson: '{"minutes":120}', status: "DRAFT", createdById: ins.id } });
  }
  F = { stamp, cs: cs.id, other: other.id, dep: dep.id, papers, items, ctrl: ctrl.id, before };
});

test.afterAll(async () => {
  const db = await testDb();
  await db.user.update({ where: { id: F.ctrl }, data: { extraRoles: F.before } });
  const head = await db.user.findUniqueOrThrow({ where: { username: "dream.head" } });
  await any(db).paperTemplate.deleteMany({ where: { chairmanId: head.id, updatedById: F.ctrl } });
  await any(db).paperValues.deleteMany({ where: { paperId: { in: F.papers } } }); await any(db).paperFieldEdit.deleteMany({ where: { paperId: { in: F.papers } } });
  // The access log is read-only by design: the test switches its guard off to clean up, then on again.
  await db.$executeRawUnsafe('ALTER TABLE "PaperAccessLog" DISABLE TRIGGER "PaperAccessLog_readonly"');
  await any(db).paperAccessLog.deleteMany({ where: { paperId: { in: F.papers } } });
  await db.$executeRawUnsafe('ALTER TABLE "PaperAccessLog" ENABLE TRIGGER "PaperAccessLog_readonly"');
  await any(db).qbPaper.deleteMany({ where: { id: { in: F.papers } } });
  await any(db).qbExt.deleteMany({ where: { itemId: { in: F.items } } }); await any(db).qbMeta.deleteMany({ where: { itemId: { in: F.items } } }); await any(db).questionBankItem.deleteMany({ where: { id: { in: F.items } } });
  await any(db).paperVetting.deleteMany({ where: { courseId: { in: [F.cs, F.other] } } });
  await db.cLO.deleteMany({ where: { courseId: { in: [F.cs, F.other] } } });
  await db.course.deleteMany({ where: { id: { in: [F.cs, F.other] } } });
  await db.department.delete({ where: { id: F.dep } }).catch(() => null);
});

test("a CS department variant overrides the institute template for CS courses only; fields filled; an edited date is logged; exports keep the template", async ({ playwright, browser }) => {
  const db = await testDb();
  const ctrl = await ctx(playwright, "dream.t10");
  const cs = await db.department.findFirstOrThrow({ where: { name: "Department of Computing", chairman: { username: "dream.head" } } });
  const save = (b: Record<string, unknown>) => ctrl.post("/api/paper", { data: { action: "template", ...b } }).then(json);
  expect((await save({ scope: "INSTITUTE", examType: "ALL", config: { instructions: `INSTITUTE RULES ${F.stamp}`, footer: "Dream University" } })).id).toBeTruthy();
  expect((await save({ scope: "DEPARTMENT", scopeId: cs.id, examType: "ALL", config: { instructions: `CS RULES ${F.stamp}`, numbering: "1.1", sections: [{ title: "Section A - MCQ", types: ["MCQ"] }, { title: "Section B - Written", types: ["SHORT", "LONG"], attemptAny: 1 }] } })).id).toBeTruthy();
  const t = await ctx(playwright, "dream.instructor");
  expect((await t.post("/api/paper", { data: { action: "template", scope: "INSTITUTE", config: {} } }).then(json)).error, "only the Controller").toMatch(/Controller/);
  // On screen: the CS paper in the CS template, the other in the institute's.
  const page = await (await browser.newContext()).newPage(); await signIn(page.context(), "dream.instructor");
  await page.goto(`/papers/${F.papers[0]}`);
  await expect(page.locator("body")).not.toContainText(BROKEN);
  await expect(page.locator("[data-paper]")).toContainText(`CS RULES ${F.stamp}`);
  await expect(page.locator("[data-paper]")).toContainText("Section B - Written");
  await expect(page.locator("[data-paper]")).toContainText("Attempt any 1 of 2.");
  await expect(page.locator('[data-field="Course"]')).toContainText(`TPL-CS-${F.stamp}`);
  await expect(page.locator('[data-field="Department"]')).toContainText("Department of Computing");
  await expect(page.locator('[data-field="Teacher"]')).toContainText((await db.user.findUniqueOrThrow({ where: { username: "dream.instructor" } })).name);
  await page.goto(`/papers/${F.papers[1]}`);
  await expect(page.locator("[data-paper]")).toContainText(`INSTITUTE RULES ${F.stamp}`);
  await expect(page.locator('[data-field="Department"]')).toContainText(`E2E Management ${F.stamp}`);
  await page.context().close();
  // An edited date is logged.
  expect((await t.post("/api/paper", { data: { action: "value", paperId: F.papers[0], field: "date", value: "2026-12-15" } }).then(json)).value).toBe("2026-12-15");
  expect(await any(db).paperFieldEdit.count({ where: { paperId: F.papers[0], field: "date", newValue: "2026-12-15" } })).toBe(1);
  expect(await db.auditLog.count({ where: { action: "PAPER_VALUE_EDITED", entityId: F.papers[0] } })).toBe(1);
  // Word and PDF keep the template.
  const docx = await t.get(`/api/paper?paper=${F.papers[0]}&format=docx`); expect(docx.status()).toBe(200);
  const xml = await (await JSZip.loadAsync(await docx.body())).file("word/document.xml")!.async("string");
  expect(xml).toContain(`CS RULES ${F.stamp}`); expect(xml).toContain("Section B - Written"); expect(xml).toContain("2026-12-15");
  const pdf = await t.get(`/api/paper?paper=${F.papers[0]}&format=pdf`); expect(pdf.status()).toBe(200);
  // pdf.js is an ES module: a real dynamic import (the test runner would turn import() into require()).
  const pdfjs = await (new Function("s", "return import(s)") as (s: string) => Promise<any>)("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await pdf.body()), useSystemFonts: true, disableFontFace: true, isEvalSupported: false }).promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) text += ((await (await doc.getPage(i)).getTextContent()).items as { str: string }[]).map((x) => x.str).join(" ") + " ";
  text = text.replace(/\s+/g, " ");
  expect(text).toContain(`CS RULES ${F.stamp}`); expect(text).toContain("Section A - MCQ"); expect(text).toContain("Attempt any 1 of 2.");
  for (const c of [ctrl, t]) await c.dispose();
});

test("security: a PL opening the paper is logged and the teacher told; once vetted it is locked — the teacher can't open it, the Controller's download is watermarked and logged; the log can't be changed", async ({ playwright, browser }) => {
  const db = await testDb();
  const pid = F.papers[0];
  await any(db).qbPaper.update({ where: { id: pid }, data: { status: "ADOPTED" } });
  await any(db).paperVetting.create({ data: { courseId: F.cs, examType: "Final", status: "SUBMITTED", questionsJson: "{}" } });
  const ins = await db.user.findUniqueOrThrow({ where: { username: "dream.instructor" } });
  const since = new Date();
  // The Program Lead opens it during vetting.
  const pl = await (await browser.newContext()).newPage(); await signIn(pl.context(), "dream.lead.cs");
  await pl.goto(`/papers/${pid}`); await expect(pl.locator("[data-paper]")).toBeVisible();
  await pl.context().close();
  expect(await any(db).paperAccessLog.count({ where: { paperId: pid, role: "PL", action: "OPENED" } })).toBe(1);
  expect(await db.notification.count({ where: { userId: ins.id, title: { contains: "PL opened your" }, createdAt: { gte: since } } })).toBe(1);
  // Vetted: locked until exam day (2026-12-15, set above).
  await any(db).paperVetting.update({ where: { courseId_examType: { courseId: F.cs, examType: "Final" } }, data: { status: "APPROVED" } });
  const t = await ctx(playwright, "dream.instructor");
  expect((await t.get(`/api/paper?paper=${pid}&format=pdf`)).status()).toBe(403);
  const tp = await (await browser.newContext()).newPage(); await signIn(tp.context(), "dream.instructor");
  await tp.goto(`/papers/${pid}`); await expect(tp.locator("[data-paper-locked]")).toContainText("locked until exam day");
  await expect(tp.locator("[data-seen-by]")).toContainText("(PL)");
  await tp.context().close();
  const hod = await ctx(playwright, "dream.hod.cs");
  expect((await hod.get(`/api/paper?paper=${pid}&format=pdf`)).status(), "the HOD opens, but only the Controller prints").toBe(403);
  const hp = await (await browser.newContext()).newPage(); await signIn(hp.context(), "dream.hod.cs");
  await hp.goto(`/papers/${pid}`); await expect(hp.locator("[data-paper]")).toBeVisible(); await hp.context().close();
  const ctrl = await ctx(playwright, "dream.t10");
  const dl = await ctrl.get(`/api/paper?paper=${pid}&format=docx`); expect(dl.status()).toBe(200);
  const zip = await JSZip.loadAsync(await dl.body());
  const headers = (await Promise.all(Object.keys(zip.files).filter((f) => /word\/header\d*\.xml/.test(f)).map((f) => zip.file(f)!.async("string")))).join(" ");
  const ctrlName = (await db.user.findUniqueOrThrow({ where: { id: F.ctrl } })).name;
  expect(headers, "watermarked with the Controller's name").toContain(ctrlName);
  const log = await any(db).paperAccessLog.findMany({ where: { paperId: pid }, orderBy: { at: "asc" } });
  expect(log.map((l: { role: string; action: string }) => `${l.role}:${l.action}`)).toEqual(["PL:OPENED", "HOD:OPENED", "Controller:DOWNLOADED"]);
  expect(await db.notification.count({ where: { userId: ins.id, title: { contains: "Controller downloaded your" }, createdAt: { gte: since } } })).toBe(1);
  await expect(any(db).paperAccessLog.deleteMany({ where: { paperId: pid } })).rejects.toThrow(/read-only/);
  await expect(any(db).paperAccessLog.updateMany({ where: { paperId: pid }, data: { role: "X" } })).rejects.toThrow(/read-only/);
  for (const c of [t, hod, ctrl]) await c.dispose();
});

test("bank readiness: a course below 3 approved questions per CLO per Bloom level shows the warning (What's next and the readiness board)", async ({ playwright, browser }) => {
  const se = await ctx(playwright, "dream.se");
  const tasks = (await se.get("/api/next-tasks").then(json)).tasks as { title: string }[];
  expect(tasks.some((x) => x.title.includes(`TPL-CS-${F.stamp}`) && /question bank/i.test(x.title)), JSON.stringify(tasks.map((x) => x.title))).toBe(true);
  await se.dispose();
  const page = await (await browser.newContext()).newPage(); await signIn(page.context(), "dream.lead.cs");
  await page.goto("/semester-readiness");
  await expect(page.locator("[data-bank-warnings]")).toContainText(`TPL-CS-${F.stamp}`);
  await page.goto("/question-bank/analytics");
  await expect(page.locator("[data-coverage]")).toContainText(`TPL-CS-${F.stamp}`);
  await page.context().close();
});
