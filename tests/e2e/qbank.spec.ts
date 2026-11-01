import { test, expect, type APIRequestContext } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import JSZip from "jszip";
import { BROKEN, PASSWORD, json, signIn, testDb } from "./helpers";

// Part 6 build A: the question bank — review, the 3-term lock, results, drafting + version B into the paper, Excel,
// past papers, a PDF into the bank (typed and scanned), equations on screen / PDF / Word, sharing and access codes, the PIN.
test.describe.configure({ mode: "serial" });
const any = (db: unknown) => db as Record<string, any>;
const API = "/api/qbank";
type Ctx = APIRequestContext;
const post = async (r: Ctx, data: unknown) => { const x = await r.post(API, { data, timeout: 120_000 }); return { s: x.status(), d: await json(x) }; };
const get = async (r: Ctx, q: string) => { const x = await r.get(`${API}?${q}`); return { s: x.status(), d: await json(x) }; };
const ctx = async (playwright: { request: { newContext: (o: { baseURL?: string }) => Promise<Ctx> } }, username: string) => { const r = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL }); await signIn(r, username); return r; };
const PIN = "4826";

let F: { base: string; section: string; other: string; stamp: string; ids: string[] };
const S: Record<string, Ctx> = {};

test.beforeAll(async ({ playwright }) => {
  const db = await testDb();
  const u = async (n: string) => db.user.findUniqueOrThrow({ where: { username: n } });
  const [se, ins, lead, t8] = await Promise.all([u("dream.se"), u("dream.instructor"), u("dream.lead.cs"), u("dream.t8")]);
  const stamp = Date.now().toString(36);
  const code = `QB-${stamp}`;
  const mk = (extra: Record<string, unknown>) => db.course.create({ data: { code, title: "Data Structures (bank)", creditHours: 3, coordinatorId: lead.id, ...extra } as never });
  // The base course (SE dream.se), a section taught by dream.instructor, another section by dream.t8 — all the same code.
  const base = await mk({ subjectExpertId: se.id, templateStatus: "approved" });
  const section = await db.course.create({ data: { code: `${code}`, title: "Data Structures (bank)", creditHours: 3, coordinatorId: lead.id, instructorId: ins.id, batchId: (await db.batch.findFirstOrThrow({ where: { coordinator: { username: "dream.lead.cs" } } as never })).id } as never });
  const other = await db.course.create({ data: { code, title: "Data Structures (bank)", creditHours: 3, coordinatorId: lead.id, instructorId: t8.id, batchId: (await db.batch.findMany({ where: { coordinator: { username: "dream.lead.cs" } } as never, take: 2 }))[1]?.id } as never });
  for (const [c, src] of [[base, "SE"], [section, "INSTRUCTOR"], [section, "SE"]] as const) {
    const clos = [];
    for (let n = 1; n <= 3; n++) clos.push(await db.cLO.create({ data: { courseId: c.id, source: src, code: `CLO-${n}`, statement: `CLO ${n} statement`, bloomLevel: "C2", orderIndex: n - 1 } }));
    for (let l = 1; l <= 12; l++) await db.lectureRow.create({ data: { courseId: c.id, source: src, week: Math.ceil(l / 2), lectureNumber: l, topic: l === 3 ? "Stacks and queues" : `Topic ${l}`, cloId: clos[l <= 4 ? 0 : l <= 8 ? 1 : 2].id, actualDate: src === "INSTRUCTOR" ? new Date(l <= 8 ? `2026-09-${String(l + 1).padStart(2, "0")}` : "2026-12-01") : null } });
  }
  F = { base: base.id, section: section.id, other: other.id, stamp, ids: [base.id, section.id, other.id] };
  for (const n of ["dream.se", "dream.instructor", "dream.lead.cs", "dream.t8"]) S[n] = await ctx(playwright, n);
  for (const n of Object.keys(S)) await any(db).qbPin.deleteMany({ where: { userId: (await u(n)).id } });
});

test.afterAll(async () => {
  const db = await testDb();
  for (const c of Object.values(S)) await c.dispose();
  const items = ((await any(db).questionBankItem.findMany({ where: { courseCode: `QB-${F.stamp}` }, select: { id: true } })) as { id: string }[]).map((x) => x.id);
  await any(db).qbExt.deleteMany({ where: { itemId: { in: items } } }); await any(db).qbMeta.deleteMany({ where: { itemId: { in: items } } });
  await any(db).qbUse.deleteMany({ where: { itemId: { in: items } } }); await any(db).qbLog.deleteMany({ where: { itemId: { in: items } } });
  await any(db).qbGrant.deleteMany({ where: { itemIdsJson: { contains: items[0] || "none" } } });
  await any(db).questionBankItem.deleteMany({ where: { id: { in: items } } });
  await any(db).qbPaper.deleteMany({ where: { courseId: { in: F.ids } } });
  const insts = (await db.assessmentInstrument.findMany({ where: { courseId: { in: F.ids } }, select: { id: true } })).map((i) => i.id);
  await db.studentMark.deleteMany({ where: { instrumentId: { in: insts } } });
  await db.assessmentInstrument.deleteMany({ where: { id: { in: insts } } });
  await any(db).paperVetting.deleteMany({ where: { courseId: { in: F.ids } } });
  await db.paperDistributionItem.deleteMany({ where: { courseId: { in: F.ids } } });
  await db.lectureRowInstrument.deleteMany({ where: { lectureRow: { courseId: { in: F.ids } } } });
  await db.lectureRow.deleteMany({ where: { courseId: { in: F.ids } } });
  await db.cLO.deleteMany({ where: { courseId: { in: F.ids } } });
  await db.course.deleteMany({ where: { id: { in: F.ids } } }).catch((e) => console.warn("course cleanup:", (e as Error).message));
});

test("the PIN: asked first, set with the password, times out after 15 minutes; 5 wrong PINs tell the user and the HOD", async ({ playwright }) => {
  const db = await testDb();
  const se = S["dream.se"];
  expect((await get(se, `courseId=${F.base}`)).d.pin).toBe(true);
  expect((await post(se, { action: "pinSet", pin: PIN, password: "wrong-password" })).d.error).toMatch(/password is not right/);
  for (const n of ["dream.se", "dream.instructor", "dream.lead.cs", "dream.t8"]) expect((await post(S[n], { action: "pinSet", pin: PIN, password: PASSWORD })).s).toBe(200);
  expect((await get(se, `courseId=${F.base}`)).s).toBe(200);
  const seId = (await db.user.findUniqueOrThrow({ where: { username: "dream.se" } })).id;
  await any(db).qbPin.update({ where: { userId: seId }, data: { lastActiveAt: new Date(Date.now() - 16 * 60000) } });
  expect((await get(se, `courseId=${F.base}`)).d.pin, "15 minutes idle → the PIN again").toBe(true);
  expect((await post(se, { action: "pinVerify", pin: PIN })).s).toBe(200);
  // 5 wrong PINs (a separate user so the others stay unlocked).
  const t9 = await ctx(playwright, "dream.t9");
  const t9u = await db.user.findUniqueOrThrow({ where: { username: "dream.t9" } });
  await any(db).qbPin.deleteMany({ where: { userId: t9u.id } });
  await post(t9, { action: "pinSet", pin: PIN, password: PASSWORD });
  const since = new Date();
  for (let i = 0; i < 5; i++) await post(t9, { action: "pinVerify", pin: "0000" });
  expect((await post(t9, { action: "pinVerify", pin: PIN })).d.error).toMatch(/Too many wrong PINs/);
  const hod = await db.user.findFirstOrThrow({ where: { role: "HEAD_OF_DEPARTMENT", departmentId: t9u.departmentId } });
  for (const id of [t9u.id, hod.id]) expect(await db.notification.count({ where: { userId: id, title: { contains: "5 wrong PINs" }, createdAt: { gte: since } } }), id).toBe(1);
  expect((await post(t9, { action: "pinSet", pin: "1357", password: PASSWORD })).s, "Forgot PIN: reset with the account password").toBe(200);
  await any(db).qbPin.deleteMany({ where: { userId: t9u.id } });
  await t9.dispose();
});

test("bank: the SE adds directly; an Instructor's shared question stays Draft until approved; private / course / chosen / access code; equations render", async ({ browser }) => {
  const db = await testDb();
  const se = S["dream.se"], ins = S["dream.instructor"], t8 = S["dream.t8"], pl = S["dream.lead.cs"];
  const add = async (r: Ctx, courseId: string, b: Record<string, unknown>) => post(r, { action: "add", courseId, type: "LONG", marks: 10, bloom: "C2", difficulty: "MEDIUM", modelAnswer: "…", ...b });
  const ids: Record<string, string> = {};
  for (const [k, clo, lec] of [["a", "CLO-1", 2], ["a2", "CLO-1", 3], ["b", "CLO-2", 5], ["b2", "CLO-2", 6], ["late", "CLO-1", 11]] as const) {
    const r = await add(se, F.base, { text: `${k} — ${F.stamp}: explain the ${k} case in detail with an example ${k.repeat(3)}`, cloCodes: [clo], lectureNumber: lec });
    expect(r.d.status, JSON.stringify(r.d)).toBe("APPROVED"); ids[k] = r.d.id;
  }
  const eq = await add(se, F.base, { text: `Evaluate $\\frac{a}{b}$ when a = 6 and b = 3 (${F.stamp})`, type: "NUMERICAL", marks: 2, cloCodes: ["CLO-3"], lectureNumber: 9, numericAnswer: 2, tolerance: 0.01 });
  ids.eq = eq.d.id;
  // The Instructor's shared question: a Draft; the other section's teacher does not see it until it is approved.
  const p = await add(ins, F.section, { text: `Proposed question ${F.stamp}: compare stacks with queues`, cloCodes: ["CLO-1"], lectureNumber: 3, visibility: "COURSE" });
  expect(p.d.status).toBe("DRAFT"); ids.p = p.d.id;
  const seesP = async (r: Ctx) => ((await get(r, `courseId=${F.other}`)).d.items as { id: string }[]).some((x) => x.id === ids.p);
  expect(await seesP(t8)).toBe(false);
  expect(((await get(pl, `courseId=${F.base}`)).d.items as { id: string; status: string }[]).find((x) => x.id === ids.p)?.status, "the Program Lead sees it to review").toBe("DRAFT");
  expect((await post(t8, { action: "review", id: ids.p, decision: "APPROVE" })).d.error).toMatch(/Subject Expert or the Program Lead/);
  expect((await post(se, { action: "review", id: ids.p, decision: "APPROVE" })).d.status).toBe("APPROVED");
  expect(await seesP(t8), "course teachers see it once approved").toBe(true);
  // Private: only the author; chosen: only the chosen colleague; access code: one colleague until revoked.
  const priv = await add(ins, F.section, { text: `My private question ${F.stamp}: trace a recursive call`, cloCodes: ["CLO-2"], lectureNumber: 5, visibility: "PRIVATE" });
  ids.priv = priv.d.id;
  expect(await (async () => ((await get(t8, `courseId=${F.other}`)).d.items as { id: string }[]).some((x) => x.id === ids.priv))()).toBe(false);
  expect(((await get(se, `courseId=${F.base}`)).d.items as { id: string }[]).some((x) => x.id === ids.priv), "private is hidden from the SE too").toBe(false);
  const t8u = await db.user.findUniqueOrThrow({ where: { username: "dream.t8" } });
  expect((await post(ins, { action: "share", id: ids.priv, visibility: "CHOSEN", sharedWith: [t8u.id] })).s).toBe(200);
  await post(se, { action: "review", id: ids.priv, decision: "APPROVE" });
  expect(((await get(t8, `courseId=${F.other}`)).d.items as { id: string }[]).some((x) => x.id === ids.priv), "the chosen colleague sees it").toBe(true);
  await post(ins, { action: "share", id: ids.priv, visibility: "PRIVATE" });
  const code = await post(ins, { action: "code", itemIds: [ids.priv], days: 7, purpose: "Quiz 3" });
  expect(code.s, JSON.stringify(code.d)).toBe(200);
  expect((await post(t8, { action: "redeem", code: code.d.code })).d.count).toBe(1);
  expect(((await get(t8, `courseId=${F.other}`)).d.items as { id: string }[]).some((x) => x.id === ids.priv), "the code lets the colleague use it").toBe(true);
  expect((await post(se, { action: "redeem", code: code.d.code })).d.error, "one colleague only").toMatch(/already used/);
  await post(ins, { action: "revoke", id: code.d.id });
  expect(((await get(t8, `courseId=${F.other}`)).d.items as { id: string }[]).some((x) => x.id === ids.priv), "revoked").toBe(false);
  const mine = (await get(ins, "mine=1")).d;
  expect(mine.logs.some((l: { action: string }) => l.action === "CODE_USED")).toBe(true);
  // Equations render on screen (KaTeX), in the bank page.
  const page = await (await browser.newContext()).newPage();
  await signIn(page.context(), "dream.se");
  await page.goto(`/question-bank?courseId=${F.base}`);
  await page.locator("[data-pin-input]").fill(PIN); await page.locator("[data-pin-go]").click();
  const eqEl = page.locator(`[data-q="${ids.eq}"] [data-latex]`).first();
  await expect(eqEl.locator(".katex")).toBeVisible({ timeout: 30_000 });
  expect(await eqEl.getAttribute("data-latex")).toBe("\\frac{a}{b}");
  await expect(page.locator("body")).not.toContainText(BROKEN);
  await page.context().close();
  (F as unknown as Record<string, unknown>).q = ids;
});

test("drafting a final: CLO limits, only topics taught before the exam, version B with the same profile; it becomes the paper; used in a final → locked 3 terms; unlock logged; results flag too hard", async () => {
  const db = await testDb();
  const ins = S["dream.instructor"], se = S["dream.se"];
  const ids = (F as unknown as { q: Record<string, string> }).q;
  // The browser session of the last test took over dream.se's bank session (one at a time): unlock again here.
  expect((await get(se, `courseId=${F.base}`)).d.pin).toBe(true);
  await post(se, { action: "pinVerify", pin: PIN });
  const d = await post(ins, { action: "draft", courseId: F.section, examType: "Final", total: 20, minutes: 120, examDate: "2026-11-01", cloShares: { "CLO-1": 1, "CLO-2": 1 } });
  expect(d.s, JSON.stringify(d.d)).toBe(200);
  expect(d.d.check.ok, d.d.check.fails?.join(" ")).toBe(true);
  expect(d.d.lastTaught).toBe(8);
  const chosen = d.d.chosen as { id: string; cloCodes: string[]; marks: number; lectureNumber: number }[];
  expect(chosen.some((q) => q.id === ids.late), "lecture 11 is taught after the exam").toBe(false);
  expect(d.d.check.cloPct).toEqual({ "CLO-1": 50, "CLO-2": 50 });
  const v = await post(ins, { action: "variant", paperId: d.d.id });
  expect(v.d.missing).toEqual([]);
  const prof = (qs: { cloCodes: string[]; marks: number }[]) => qs.map((q) => `${q.cloCodes[0]}:${q.marks}`).sort().join("|");
  expect(prof(v.d.chosen)).toBe(prof(chosen));
  expect((v.d.chosen as { id: string }[]).some((q) => chosen.some((c) => c.id === q.id))).toBe(false);
  // The PDF and Word versions of a paper with an equation.
  const pdf = await ins.get(`${API}?paper=${d.d.id}&format=pdf`); expect(pdf.status()).toBe(200); expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");
  // Adopt version A: the course's final paper, every question mapped to a CLO; the questions get locked.
  const a = await post(ins, { action: "adopt", paperId: d.d.id });
  expect(a.s, JSON.stringify(a.d)).toBe(200);
  const plan = await db.paperDistributionItem.findMany({ where: { courseId: F.section, source: "INSTRUCTOR", examType: "Final" }, include: { clo: true } });
  expect(plan).toHaveLength(chosen.length); expect(plan.every((x) => !!x.clo)).toBe(true);
  expect((await any(db).paperVetting.findUnique({ where: { courseId_examType: { courseId: F.section, examType: "Final" } } })).questionsJson).toContain(F.stamp);
  const ext = await any(db).qbExt.findUnique({ where: { itemId: chosen[0].id } });
  expect(ext.lockedUntil).toBeGreaterThan(0);
  const again = await post(ins, { action: "draft", courseId: F.section, examType: "Final", total: 20, minutes: 120, examDate: "2026-11-01", excludeTerms: 0, cloShares: { "CLO-1": 1, "CLO-2": 1 } });
  expect((again.d.chosen as { id: string }[]).some((q) => chosen.some((c) => c.id === q.id)), "locked questions are left out").toBe(false);
  expect((await post(ins, { action: "unlock", id: chosen[0].id, reason: "Paper re-set" })).d.error).toMatch(/Subject Expert or the Program Lead/);
  expect((await post(se, { action: "unlock", id: chosen[0].id, reason: "Re-sit paper needs it" })).s).toBe(200);
  expect(await any(db).qbLog.count({ where: { itemId: chosen[0].id, action: "UNLOCKED", detail: "Re-sit paper needs it" } })).toBe(1);
  expect(await db.auditLog.count({ where: { action: "QB_QUESTION_UNLOCKED", entityId: chosen[0].id } })).toBe(1);
  // Marks for Q1 average 22% → too hard; discrimination calculated.
  const students = await db.student.findMany({ take: 10, select: { id: true } });
  const enteredById = (await db.user.findUniqueOrThrow({ where: { username: "dream.instructor" } })).id;
  const q1 = await db.assessmentInstrument.create({ data: { courseId: F.section, source: "INSTRUCTOR", type: "Final", label: "1", marksPct: 25, maxScore: 10 } });
  const q2 = await db.assessmentInstrument.create({ data: { courseId: F.section, source: "INSTRUCTOR", type: "Final", label: "2", marksPct: 25, maxScore: 10 } });
  const s1 = [8, 8, 1, 1, 1, 1, 1, 1, 0, 0], s2 = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
  for (const [i, s] of students.entries()) {
    await db.studentMark.create({ data: { studentId: s.id, courseId: F.section, instrumentId: q1.id, score: s1[i], enteredById } });
    await db.studentMark.create({ data: { studentId: s.id, courseId: F.section, instrumentId: q2.id, score: s2[i], enteredById } });
  }
  const st = await post(ins, { action: "stats", courseId: F.section });
  expect(st.s, JSON.stringify(st.d)).toBe(200);
  const firstQ = plan.sort((x, y) => x.questionNo - y.questionNo)[0];
  void firstQ;
  const row = (st.d.rows as { itemId: string; avgPct: number; flags: string[]; discrimination: number }[]).find((r) => r.itemId === chosen[0].id)!;
  expect(row.avgPct).toBe(22); expect(row.flags).toContain("TOO_HARD"); expect(row.discrimination).not.toBeNull();
  expect((await any(db).qbExt.findUnique({ where: { itemId: chosen[0].id } })).measuredDifficulty).toBe("HARD");
});

test("getting questions in: Excel preview with row errors, import; past papers into the bank; a typed PDF → one draft per question; a scanned one warns", async () => {
  const db = await testDb();
  const ins = S["dream.instructor"], se = S["dream.se"];
  // Excel.
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet("Questions");
  ws.addRow(["Question", "Type", "Parts", "CLO", "Bloom", "Difficulty", "Marks", "Topic", "Answer", "Source"]);
  ws.addRow([`Which structure is LIFO? (${F.stamp})\na) Queue\nb) Stack`, "MCQ", "", "CLO-1", "C1", "Easy", 1, "L3", "b", "Own"]);
  ws.addRow([`Bad row ${F.stamp}`, "MCQ", "", "CLO-6", "C2", "Easy", "", "L3", "", ""]);
  const file = (name: string, buf: Buffer, mimeType: string) => ({ name, mimeType, buffer: buf });
  const xbuf = Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
  const pv = await ins.post(API, { multipart: { kind: "sheet", courseId: F.section, file: file("bank.xlsx", xbuf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") } });
  const pvd = await json(pv);
  expect(pvd.rows).toHaveLength(1); expect(pvd.errors.join(" ")).toMatch(/Row 3: .*CLO-6 does not exist/);
  const bad = await json(await ins.post(API, { multipart: { kind: "sheet", apply: "1", courseId: F.section, file: file("bank.xlsx", xbuf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") } }));
  expect(bad.error).toMatch(/Nothing was saved/);
  ws.spliceRows(3, 1);
  const ok = await json(await ins.post(API, { multipart: { kind: "sheet", apply: "1", courseId: F.section, file: file("bank.xlsx", Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") } }));
  expect(ok.added).toBe(1);
  // Past papers: the other section's old final (question plan + vetting text) becomes bank questions.
  const clo = await db.cLO.findFirstOrThrow({ where: { courseId: F.base, code: "CLO-2" } });
  const it = await db.paperDistributionItem.create({ data: { courseId: F.other, source: "INSTRUCTOR", examType: "Final", questionNo: 1, topicText: "Topic 5", cloId: clo.id, cognitiveLevel: "C4", marks: 12 } });
  await any(db).paperVetting.create({ data: { courseId: F.other, examType: "Final", status: "APPROVED", questionsJson: JSON.stringify({ [it.id]: `Past final question ${F.stamp}: analyse the cost of insertion` }) } });
  const past = await post(se, { action: "past", courseId: F.base });
  expect(past.d.added, JSON.stringify(past.d)).toBeGreaterThanOrEqual(1);
  const pastItem = await any(db).questionBankItem.findFirst({ where: { text: { contains: `Past final question ${F.stamp}` } } });
  expect(pastItem.marks).toBe(12); expect((await any(db).qbExt.findUnique({ where: { itemId: pastItem.id } })).sourceKind).toBe("PAST");
  // A typed PDF: split into questions with suggestions.
  const doc = await PDFDocument.create(); const font = await doc.embedFont(StandardFonts.Helvetica); const pg = doc.addPage([595, 842]);
  ["Q1. Define a stack and give one use. (5 marks)", "Q2. Compare stacks and queues for a print spooler. (10 marks)", "Q3. Design a queue using two stacks. (10 marks)"].forEach((l, i) => pg.drawText(l, { x: 40, y: 780 - i * 30, size: 11, font }));
  for (let k = 0; k < 6; k++) pg.drawText("Answer all questions. Write clearly and show your working in the answer book provided.", { x: 40, y: 600 - k * 20, size: 10, font });
  const typed = await json(await ins.post(API, { multipart: { kind: "pdf", courseId: F.section, file: file("final.pdf", Buffer.from(await doc.save()), "application/pdf") } }));
  expect(typed.scanned).toBe(false);
  expect(typed.rows).toHaveLength(3);
  expect(typed.rows[0].bloom).toBe("C1"); expect(typed.rows[0].marks).toBe(5); expect(typed.rows[1].topic).toBe("Stacks and queues"); expect(typed.rows[1].cloCode).toBe("CLO-1");
  const saved = await post(ins, { action: "saveAnalysed", courseId: F.section, rows: typed.rows.map((r: Record<string, unknown>) => ({ ...r, cloCodes: [r.cloCode] })) });
  expect(saved.d.added).toBe(3);
  // A scanned PDF (an image, no text): the low-confidence warning; the (mocked) AI reads it.
  const head = await db.user.findUniqueOrThrow({ where: { username: "dream.head" } });
  const before = await any(db).aiCheckSetting.findUnique({ where: { chairmanId: head.id } });
  await any(db).aiCheckSetting.upsert({ where: { chairmanId: head.id }, create: { chairmanId: head.id, enabled: true, monthlyBudgetUsd: 5, paperModel: "mock", planModel: "mock" }, update: { enabled: true, monthlyBudgetUsd: 5, paperModel: "mock" } });
  const scan = await PDFDocument.create(); scan.addPage([595, 842]).drawRectangle({ x: 40, y: 400, width: 500, height: 300 });
  const sc = await json(await ins.post(API, { multipart: { kind: "pdf", courseId: F.section, file: file("scan.pdf", Buffer.from(await scan.save()), "application/pdf") } }));
  expect(sc.scanned).toBe(true); expect(sc.warning).toMatch(/scanned/);
  expect(sc.rows.length).toBe(2); expect(sc.ai?.model).toBe("mock");
  if (before) await any(db).aiCheckSetting.update({ where: { chairmanId: head.id }, data: { enabled: before.enabled, monthlyBudgetUsd: before.monthlyBudgetUsd, paperModel: before.paperModel } }); else await any(db).aiCheckSetting.delete({ where: { chairmanId: head.id } });
  // The Word paper keeps the equation as a native equation.
  const ids = (F as unknown as { q: Record<string, string> }).q;
  const pid = "p" + F.stamp;
  await any(db).qbPaper.create({ data: { id: pid, courseId: F.section, examType: "Quiz", itemIdsJson: JSON.stringify([ids.eq]), createdById: (await db.user.findUniqueOrThrow({ where: { username: "dream.instructor" } })).id } });
  const docx = await ins.get(`${API}?paper=${pid}&format=docx`); expect(docx.status()).toBe(200);
  const xml = await (await JSZip.loadAsync(await docx.body())).file("word/document.xml")!.async("string");
  expect(xml).toContain("<m:oMath"); expect(xml).toContain("<m:f>");
  const pdf = await ins.get(`${API}?paper=${pid}&format=pdf`);
  expect((await pdf.body()).toString("latin1")).toMatch(/\/Subtype\s*\/Image/);
});
