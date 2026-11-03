import { test, expect, type Browser, type BrowserContext } from "@playwright/test";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { BROKEN, json, signIn, signInStudent, testDb } from "./helpers";

// Queue item 12.3 — the role agent. Each role walks its own journey through the app on the seeded demo institute:
// it acts, then checks that the result shows up where it should, times every step and takes one screenshot per role.
// All steps run even when one fails; the run ends with one summary (test-results/role-agent.md, also written to the
// GitHub job summary) such as "8 roles, 41 steps, 2 failed: …". It runs on every merge and nightly (.github/workflows/e2e.yml).
test.describe.configure({ mode: "serial" });

type Result = { role: string; step: string; ok: boolean; ms: number; note: string };
const results: Result[] = [];
const OUT = join(process.cwd(), "test-results", "role-agent");
const any = (x: unknown) => x as Record<string, any>;

async function step(role: string, name: string, fn: () => Promise<string | void>) {
  const t = Date.now();
  try { const note = (await fn()) || ""; results.push({ role, step: name, ok: true, ms: Date.now() - t, note }); }
  catch (e) { results.push({ role, step: name, ok: false, ms: Date.now() - t, note: String((e as Error).message || e).split("\n")[0].slice(0, 240) }); }
}
const as = async (browser: Browser, username: string) => { const ctx = await browser.newContext(); await signIn(ctx, username); return ctx; };
const call = async (ctx: BrowserContext, method: "GET" | "POST", url: string, data?: unknown) => { const r = await ctx.request.fetch(url, { method, ...(data === undefined ? {} : { data }) }); return { s: r.status(), d: await json(r), type: r.headers()["content-type"] || "" }; };
const ok = (r: { s: number; d: Record<string, any> }, what: string) => { if (r.s !== 200) throw new Error(`${what}: ${r.s} ${r.d.error || JSON.stringify(r.d).slice(0, 160)}`); return r.d; };
async function page(ctx: BrowserContext, url: string, expectText?: RegExp, shot?: string) {
  const p = await ctx.newPage();
  try {
    const res = await p.goto(url);
    if (!res || res.status() >= 400) throw new Error(`${url}: HTTP ${res?.status()}`);
    const body = await p.locator("body").innerText();
    if (BROKEN.test(body)) throw new Error(`${url}: the page broke`);
    if (expectText && !expectText.test(body)) throw new Error(`${url}: expected ${expectText}`);
    if (shot) { mkdirSync(OUT, { recursive: true }); await p.screenshot({ path: join(OUT, `${shot}.png`), fullPage: false }); }
    return body;
  } finally { await p.close(); }
}
// A 1×1 PNG: the mark-sheet scan runs on the test AI stand-in ("mock" model), which ignores the picture.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

test("Teacher: generate the whole term, adopt, scan a mark sheet, marks reach the CLO report", async ({ browser }) => {
  const db = any(await testDb());
  const R = "Teacher";
  const head = await db.user.findUniqueOrThrow({ where: { username: "dream.head" } });
  const su = await as(browser, "e2e.super");
  await step(R, "AI stand-in switched on for the institute (no AI budget spent)", async () => { ok(await call(su, "POST", "/api/admin/ai-usage", { chairmanId: head.id, monthlyBudgetUsd: 5, paperModel: "mock", planModel: "mock" }), "ai settings"); });
  const t = await as(browser, "dream.instructor");
  const ins = await db.user.findUniqueOrThrow({ where: { username: "dream.instructor" } });
  const course = await db.course.findFirst({ where: { instructorId: ins.id, isOffered: true, enrollments: { some: {} } }, select: { id: true, code: true } }) || await db.course.findFirst({ where: { instructorId: ins.id }, select: { id: true, code: true } });
  if (!course) { results.push({ role: R, step: "find a course", ok: false, ms: 0, note: "dream.instructor teaches no course" }); return; }
  await step(R, `Open ${course.code}'s plan board`, async () => { ok(await call(t, "GET", `/api/plan-generate?courseId=${course.id}`), "board"); });
  let paperId = "";
  await step(R, "Generate the whole term", async () => {
    const d = ok(await call(t, "POST", "/api/plan-generate", { action: "generateAll", courseId: course.id }), "generateAll");
    paperId = (d.items || []).find((x: { id?: string }) => x.id)?.id || "";
    return `${d.made} made, ${d.skipped} already done${(d.items || []).filter((x: { error?: string }) => x.error).length ? `, ${(d.items || []).filter((x: { error?: string }) => x.error).length} could not be made (question bank)` : ""}`;
  });
  if (paperId) await step(R, "Adopt a generated quiz (or see why it may not be adopted)", async () => {
    const r = await call(t, "POST", "/api/plan-generate", { action: "adopt", paperId });
    if (r.s === 200) { const p = await db.qbPaper.findUnique({ where: { id: paperId } }); if (p?.status !== "ADOPTED") throw new Error("adopted, but the paper is not marked ADOPTED"); return "adopted"; }
    if (/does not pass its checks/.test(String(r.d.error))) return `held back by its checks: ${String(r.d.error).slice(0, 100)}`;
    throw new Error(`${r.s} ${r.d.error}`);
  });
  let scan: Record<string, any> = {};
  await step(R, "Scan a mark sheet (test AI stand-in)", async () => {
    const r = await t.request.post(`/api/instructor/courses/${course.id}/marks-scan`, { multipart: { file: { name: "sheet.png", mimeType: "image/png", buffer: PNG } } });
    scan = await json(r); if (r.status() !== 200) throw new Error(`${r.status()} ${scan.error}`);
    return `${scan.rows?.length || 0} rows read, ${scan.unmatched ?? 0} unmatched`;
  });
  await step(R, "Submit the scanned marks; they are saved for the students", async () => {
    const inst = await db.assessmentInstrument.findFirst({ where: { courseId: course.id, source: "INSTRUCTOR", marksPct: { gt: 0 }, type: { in: ["Quiz", "Assignment"] } }, select: { id: true, maxScore: true } });
    const enr = await db.studentEnrollment.findMany({ where: { courseId: course.id }, select: { student: { select: { id: true, rollNumber: true } } }, take: 2 });
    if (!inst || !enr.length) return "no quiz or no enrolled students in this course — nothing to submit";
    const rows = (scan.rows || []).filter((r: { student?: unknown }) => r.student).map((r: { student: { roll: string } }, i: number) => ({ key: r.student.roll, scores: { "0": String(Math.min(inst.maxScore, 7 + i)) } }));
    const use = rows.length ? rows : enr.map((e: { student: { rollNumber: string } }, i: number) => ({ key: e.student.rollNumber, scores: { "0": String(Math.min(inst.maxScore, 6 + i)) } }));
    const d = ok(await call(t, "POST", `/api/instructor/courses/${course.id}/lms-import`, { source: "Scan", overwrite: true, map: [{ col: "0", instrumentId: inst.id, outOf: inst.maxScore }], rows: use }), "save marks");
    const saved = await db.studentMark.count({ where: { courseId: course.id, instrumentId: inst.id } });
    if (!saved) throw new Error("no mark is stored after the import");
    return `${d.written} written`;
  });
  await step(R, "CLO attainment shows the course", async () => { await page(t, `/courses/${course.id}/clo-attainment?source=INSTRUCTOR`, /CLO/); });
  await step(R, "Teaching tools page of the course", async () => { await page(t, `/course-tools/${course.id}`, /Teaching tools|teaching tools/, "teacher"); });
});

test("HOD: approvals, year-plan what-if, classroom observation", async ({ browser }) => {
  const db = any(await testDb());
  const R = "HOD";
  const h = await as(browser, "dream.hod.cs");
  await step(R, "My Approvals lists what is waiting", async () => { const d = ok(await call(h, "GET", "/api/approvals"), "approvals"); return `${d.total ?? 0} waiting`; });
  await step(R, "Approve all that pass (only items that pass their checks)", async () => {
    const d = ok(await call(h, "GET", "/api/approvals"), "approvals");
    const items = ((d.items || []) as { kind: string; id: string; checks?: string[] }[]).filter((x) => !x.checks?.length).slice(0, 5);
    if (!items.length) return "nothing that passes is waiting";
    const r = ok(await call(h, "POST", "/api/approvals", { action: "bulk", items: items.map((x) => ({ kind: x.kind, id: x.id })) }), "bulk");
    return `${r.done} approved${r.errors?.length ? `, ${r.errors.length} left for one-by-one` : ""}`;
  });
  await step(R, "Year plan and its what-if", async () => { await page(h, "/allocation/year-plan", undefined, "hod"); });
  await step(R, "Record a classroom observation; it is kept for the teacher", async () => {
    const hod = await db.user.findUniqueOrThrow({ where: { username: "dream.hod.cs" } });
    const c = await db.course.findFirst({ where: { instructorId: { not: null, notIn: [hod.id] }, coordinator: { managedById: hod.managedById || undefined } }, select: { id: true } });
    if (!c) throw new Error("no course with a teacher");
    const before = await db.classObservation.count({ where: { courseId: c.id } });
    ok(await call(h, "POST", "/api/observations", { courseId: c.id, lectureNumber: 1, scores: {}, strengths: "Clear examples (role agent).", improve: "More questions to the class." }), "observation");
    const after = await db.classObservation.count({ where: { courseId: c.id } });
    if (after <= before) throw new Error("the observation was not stored");
  });
  await step(R, "Observations page", async () => { await page(h, "/observations"); });
});

test("Program Lead / OMC: term rollover, curriculum what-if, batch approval", async ({ browser }) => {
  const R = "Program Lead";
  const pl = await as(browser, "dream.lead.cs");
  await step(R, "Term rollover shows what next term needs", async () => { await page(pl, "/term-rollover", undefined, "program-lead"); });
  await step(R, "Curriculum what-if", async () => { await page(pl, "/curriculum-whatif"); });
  await step(R, "Curriculum comparison (HEC, national, CLOs & topics)", async () => { await page(pl, "/curriculum-compare"); });
  const omc = await as(browser, "dream.omc");
  await step("OMC", "Batch approvals waiting for the OMC", async () => { await page(omc, "/approvals", undefined, "omc"); });
});

test("Controller, college and university: results, sessionals, registration numbers and OBE transcripts", async ({ browser }) => {
  const c = await as(browser, "dream.controller");
  await step("Controller", "Controller dashboard and result publishing", async () => { await page(c, "/controller", undefined, "controller"); });
  const col = await as(browser, "dream.college");
  await step("College", "Affiliation: sessional marks", async () => { await page(col, "/affiliation?tab=RESULTS", undefined, "college"); });
  const uni = await as(browser, "dream.affiliation");
  await step("University", "Affiliation: registration numbers and OBE transcripts", async () => { await page(uni, "/affiliation?tab=RESULTS", undefined, "university"); });
});

test("Student: rate my CLOs, practice, skills transcript, live lectures", async ({ browser }) => {
  const db = any(await testDb());
  const R = "Student";
  const ctx = await browser.newContext();
  await signInStudent(ctx, "DRM-CS-24-001");
  const st = await db.student.findFirstOrThrow({ where: { rollNumber: "DRM-CS-24-001" }, select: { id: true } });
  const enr = await db.studentEnrollment.findFirst({ where: { studentId: st.id, course: { clos: { some: {} } } }, select: { courseId: true } });
  if (!enr) { results.push({ role: R, step: "find a course with CLOs", ok: false, ms: 0, note: "the student has no course with CLOs" }); return; }
  await step(R, "Rate my CLOs; the rating is stored", async () => {
    const clo = await db.cLO.findFirst({ where: { courseId: enr.courseId }, orderBy: { orderIndex: "asc" }, select: { code: true } });
    ok(await call(ctx, "POST", "/api/student/clo-self", { courseId: enr.courseId, ratings: { [clo.code]: 4 } }), "clo-self");
    const n = await db.cloSelfRating.count({ where: { studentId: st.id, courseId: enr.courseId } });
    if (!n) throw new Error("no rating stored");
  });
  await step(R, "Practice questions for the course", async () => { await page(ctx, `/student/practice/${enr.courseId}`, undefined, "student"); });
  await step(R, "Skills transcript (PDF)", async () => { const r = await call(ctx, "GET", "/api/skills-transcript"); if (r.s !== 200 || !/pdf/.test(r.type)) throw new Error(`${r.s} ${r.type}`); });
  await step(R, "Live lectures", async () => { await page(ctx, "/student/live", /Live lectures/); });
});

test("ODL lead: an ODL programme through all 8 steps, teaching tools, evidence file", async ({ browser }) => {
  const R = "ODL lead";
  const h = await as(browser, "dream.head");
  let id = "";
  await step(R, "Start an ODL programme", async () => { id = ok(await call(h, "POST", "/api/collab", { action: "create", kind: "ODL_PROGRAM", title: "BS Computer Science (ODL) — role agent" }), "create").id; });
  if (!id) return;
  await step(R, "Add an ODL course and its mode", async () => { ok(await call(h, "POST", "/api/collab", { action: "save", id, data: { courses: [{ code: "CC-112", mode: "BLENDED", ch: 3 }] } }), "save"); });
  for (let i = 0; i < 8; i++) await step(R, `Wizard step ${i + 1} opens`, async () => { await page(h, `/collab?id=${id}&step=${i}`, /Step \d of 8/, i === 7 ? "odl-lead" : undefined); });
  await step(R, "Answer a readiness question; it is kept", async () => {
    ok(await call(h, "POST", "/api/collab", { action: "save", id, data: { readiness: { 4: { yes: true, evidence: "Annex-4 learner profile" } } } }), "readiness");
    const body = await page(h, `/collab?id=${id}&step=1`);
    if (!/answered Yes/.test(body)) throw new Error("readiness count not shown");
  });
  await step(R, "Teaching tools page", async () => { await page(h, "/teaching-tools", /Teaching tools/); });
  await step(R, "Evidence file (PDF)", async () => { const r = await call(h, "GET", `/api/odl-evidence?id=${id}`); if (r.s !== 200 || !/pdf/.test(r.type)) throw new Error(`${r.s} ${r.type}`); });
});

test.afterAll(() => {
  mkdirSync(OUT, { recursive: true });
  const roles = Array.from(new Set(results.map((r) => r.role)));
  const failed = results.filter((r) => !r.ok);
  const head = `${roles.length} roles, ${results.length} steps, ${failed.length} failed${failed.length ? `: ${failed.map((f) => `${f.role} — ${f.step}`).join("; ")}` : ""}`;
  const md = [`## Role agent: ${head}`, "", "| Role | Step | Result | Time | Note |", "|---|---|---|---|---|", ...results.map((r) => `| ${r.role} | ${r.step} | ${r.ok ? "✓" : "✗"} | ${(r.ms / 1000).toFixed(1)} s | ${r.note.replace(/\|/g, "/")} |`)].join("\n");
  writeFileSync(join(OUT, "summary.json"), JSON.stringify({ head, results }, null, 1));
  writeFileSync(join(OUT, "summary.md"), md);
  if (process.env.GITHUB_STEP_SUMMARY) { try { writeFileSync(process.env.GITHUB_STEP_SUMMARY, `${md}\n`, { flag: "a" }); } catch { /* summary is optional */ } }
  console.log(head);
});

test("Role agent: every step passed", async () => {
  const failed = results.filter((r) => !r.ok);
  expect(failed.map((f) => `${f.role} — ${f.step}: ${f.note}`), "steps that failed").toEqual([]);
});
