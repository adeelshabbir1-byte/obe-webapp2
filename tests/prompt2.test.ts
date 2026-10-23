import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { register, providerOf, allProviders, daysSince } from "../lib/approvals/registry";

const ROOT = path.join(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

// ------------------------------------------------------------------------------------------------ approvals inbox
test("approvals registry: a provider registers once by kind and is found again", async () => {
  register({ kind: "TEST_KIND", label: "Test", bulk: true, fetch: async () => [] });
  register({ kind: "TEST_KIND", label: "Test again", fetch: async () => [] });
  assert.equal(providerOf("TEST_KIND")?.label, "Test again");
  assert.equal(allProviders().filter((p) => p.kind === "TEST_KIND").length, 1);
  assert.equal(providerOf("NOPE"), null);
});

test("approvals registry: days waiting", () => {
  assert.equal(daysSince(new Date()), 0);
  assert.equal(daysSince(new Date(Date.now() - 3.5 * 864e5)), 3);
});

test("approvals: every module provider is registered and decides through the module's own route", () => {
  const src = read("lib/approvals/providers.ts");
  const kinds = Array.from(src.matchAll(/kind: "([A-Z_]+)", label:/g)).map((m) => m[1]);
  for (const k of ["LEAVE", "RESULT", "GRADE_CHANGE", "PAPER_VETTING", "REGISTRATION_HOLD", "PLAN_REQUEST", "ASSESSMENT_EXCEPTION", "STATUS_CHANGE", "ACCREDITATION_TASK", "TEACHER_LOAN", "LAB_MANUAL", "MEETING_ACTION", "BENEFIT_CLAIM", "FEE_REFUND", "DEGREE_VERIFICATION"]) assert.ok(kinds.includes(k), k);
  assert.equal(new Set(kinds).size, kinds.length, "kinds are unique");
  // Results and grade changes need judgement: never bulk.
  assert.ok(!/kind: "RESULT"[^\n]*bulk: true/.test(src));
  assert.ok(!/kind: "GRADE_CHANGE"[^\n]*bulk: true/.test(src));
});

test("approvals: returning always needs a reason, and the delegate is added by the approver resolver", () => {
  assert.match(read("lib/approvals/inbox.ts"), /action === "return" && !reason\.trim\(\)/);
  assert.match(read("lib/approvers.ts"), /delegatesOf\(a\.ids\)/);
  assert.match(read("prisma/migration_approvals_inbox.sql"), /CREATE TABLE IF NOT EXISTS "ApprovalDelegation"/);
});

// ------------------------------------------------------------------------------------------------ head dashboard
import { light, figures, DEFAULT_TARGETS, type Snapshot } from "../lib/headDashboard";

test("dashboard traffic lights: at least / at most / no target", () => {
  assert.equal(light({ now: 80, target: 80, better: "up" }), "green");
  assert.equal(light({ now: 70, target: 80, better: "up" }), "amber");
  assert.equal(light({ now: 60, target: 80, better: "up" }), "red");
  assert.equal(light({ now: 5, target: 5, better: "down" }), "green");
  assert.equal(light({ now: 6, target: 5, better: "down" }), "amber");
  assert.equal(light({ now: 9, target: 5, better: "down" }), "red");
  assert.equal(light({ now: 1, target: 0, better: "down" }), "amber");
  assert.equal(light({ now: null, target: 5, better: "down" }), "grey");
  assert.equal(light({ now: 84, target: null, better: null }), "grey");
});

test("dashboard figures add up the programs in the viewer's area only", () => {
  const prog = (program: string, departmentId: string, enrolled: number, pass: number, students: number) => ({ program, departmentId, facultyId: "F", enrolled, intake: { "2024": enrolled }, results: { cur: { students, pass, dist: { A: pass, F: students - pass } }, prev: { students: 0, pass: 0 } }, clo: { cur: { pass: 0, total: 0 }, prev: { pass: 0, total: 0 } }, plo: { cur: { pass: 0, total: 0 }, prev: { pass: 0, total: 0 } }, readiness: null, body: null, nextVisit: null, moved: { cur: { LEFT: 1 }, prev: {} }, warning: 0, probation: 0, holds: 0, shortages: 0, cqiOpen: 0, feedback: { cur: { sum: 0, adjSum: 0, n: 0 }, prev: { sum: 0, adjSum: 0, n: 0 } }, alumni: { total: 0, employed: 0 }, fte: 0, suffStudents: 0 });
  const s: Snapshot = { computedAt: new Date().toISOString(), year: 2026, terms: { results: ["Spring 2026", null], attainment: [null, null], feedback: [null, null] }, programs: [prog("BS CS", "D1", 40, 90, 100), prog("BBA", "D2", 60, 50, 100)], departments: [], institute: { fiscalYear: "2026-27", budget: 0, spent: 0, fdpTarget: 20, approvals: { open: 0, overdue: 0 }, studentsPerFteLimit: 25 } };
  const all = figures(s, { departmentIds: null, program: null }, {});
  assert.equal(all.find((f) => f.key === "enrolled")?.now, 100);
  assert.equal(all.find((f) => f.key === "passRate")?.now, 70);
  const d1 = figures(s, { departmentIds: ["D1"], program: null }, { passRate: 95 });
  assert.equal(d1.find((f) => f.key === "enrolled")?.now, 40);
  assert.equal(d1.find((f) => f.key === "passRate")?.target, 95);
  assert.equal(d1.find((f) => f.key === "attrition")?.now, 2.4); // 1 left of 41
  assert.equal(DEFAULT_TARGETS.overdue, 0);
});

// ------------------------------------------------------------------------------------------------ digital sign-off
import { contentHash, qrMatrix, qrPng, verifyPath } from "../lib/signoff";

test("sign-off: the content fingerprint ignores key order but not content", () => {
  assert.equal(contentHash({ a: 1, b: [1, { y: 2, x: 1 }] }), contentHash({ b: [1, { x: 1, y: 2 }], a: 1 }));
  assert.notEqual(contentHash({ a: 1 }), contentHash({ a: 2 }));
  assert.match(contentHash({}), /^[0-9a-f]{64}$/);
});

test("sign-off: QR code and verification address", () => {
  const m = qrMatrix("https://example.org/verify/DU-TR-2026-ABC123?h=0123456789abcdef");
  assert.ok(m.length >= 21 && m.every((r) => r.length === m.length));
  assert.ok(m[0][0] && m[0][6] && m[6][0], "finder pattern in the corner");
  const png = qrPng("x", 2);
  assert.deepEqual(Array.from(png.subarray(0, 8)), [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(verifyPath("DU-TR-2026-ABC123", "0123456789abcdef0123"), "/verify/DU-TR-2026-ABC123?h=0123456789abcdef");
});

// ------------------------------------------------------------------------------------------------ help desk, counselling, search
import { slaState, DEFAULT_SLA } from "../lib/help/deskExtra";
import { KINDS as COUNSEL_KINDS } from "../lib/counselling";

test("help desk: answer-time (SLA) state", () => {
  const now = new Date("2026-10-23T10:00:00Z");
  const e = (due: string, first: string | null = null) => ({ ticketId: "t", category: "BUG", priority: "HIGH", screenshot: null, browser: null, pageUrl: null, slaDueAt: new Date(due), firstResponseAt: first ? new Date(first) : null, slaWarnedAt: null, tags: "", fixNote: null, releaseRef: null, faqArticleId: null });
  assert.deepEqual(slaState(e("2026-10-23T14:00:00Z"), "OPEN", now), { hoursLeft: 4, overdue: false });
  assert.equal(slaState(e("2026-10-23T08:00:00Z"), "OPEN", now)?.overdue, true);
  assert.equal(slaState(e("2026-10-23T08:00:00Z", "2026-10-23T07:00:00Z"), "OPEN", now), null, "answered in time: no timer");
  assert.equal(slaState(e("2026-10-23T08:00:00Z"), "RESOLVED", now), null);
  assert.ok(DEFAULT_SLA.URGENT < DEFAULT_SLA.HIGH && DEFAULT_SLA.HIGH < DEFAULT_SLA.NORMAL);
});

test("counselling: notes stay confidential and reports carry no names", () => {
  const src = read("lib/counselling.ts");
  assert.deepEqual(Object.keys(COUNSEL_KINDS), ["ACADEMIC", "CAREER", "PERSONAL"]);
  assert.match(src, /n\.authorId === userId \|\| \(n\.kind === "ACADEMIC" && advised\.has/);
  // The report and the program evidence only count; the audit log never holds the note.
  assert.ok(!/notes:/.test(src.slice(src.indexOf("export async function report"), src.indexOf("export async function syncEvidence"))));
  assert.match(src, /COUNSELLING_HELD.*metadata: \{ kind \}/);
});

test("search: every kind is limited to the person's scope, and students only search their own things", () => {
  const src = read("lib/search.ts");
  assert.match(src, /if \(v\.kind === "student"\)[\s\S]*studentEnrollment\.findMany\(\{ where: \{ studentId: v\.student\.id/);
  assert.match(src, /chairmanId: H/);
  assert.match(read("prisma/migration_search.sql"), /CREATE EXTENSION IF NOT EXISTS pg_trgm/);
});

// ------------------------------------------------------------------------------------------------ batch 3
import { fineOf } from "../lib/library";
import { eligibility, score, DEFAULT_WEIGHTS } from "../lib/recruitment";
import { parseBibtex, parseLines, dedupeKey } from "../lib/research";

test("library: fines for late books (fixed at return, none when waived)", () => {
  const now = new Date("2026-10-24T12:00:00Z");
  assert.equal(fineOf({ dueAt: new Date("2026-10-20T23:59:00Z"), returnedAt: null, fine: 0, fineWaived: false }, 20, now), 60);
  assert.equal(fineOf({ dueAt: new Date("2026-10-30T23:59:00Z"), returnedAt: null, fine: 0, fineWaived: false }, 20, now), 0);
  assert.equal(fineOf({ dueAt: new Date("2026-10-01"), returnedAt: new Date("2026-10-05"), fine: 80, fineWaived: false }, 20, now), 80);
  assert.equal(fineOf({ dueAt: new Date("2026-10-01"), returnedAt: null, fine: 0, fineWaived: true }, 20, now), 0);
});

test("recruitment: HEC eligibility per designation and the weighted score", () => {
  const pubs = (n: number, cat: string, year = 2025) => JSON.stringify(Array.from({ length: n }, (_, i) => ({ title: `p${i}`, journal: "j", year: year - (i % 7), category: cat })));
  assert.equal(eligibility("ASSISTANT_PROFESSOR", { highestDegree: "PHD", teachingYears: 0, postPhdYears: 0, publicationsJson: "[]" }).eligible, true);
  assert.equal(eligibility("ASSISTANT_PROFESSOR", { highestDegree: "MS", teachingYears: 9, postPhdYears: 0, publicationsJson: "[]" }).eligible, false);
  assert.equal(eligibility("ASSOCIATE_PROFESSOR", { highestDegree: "PHD", teachingYears: 11, postPhdYears: 6, publicationsJson: pubs(12, "X") }).eligible, true);
  assert.equal(eligibility("ASSOCIATE_PROFESSOR", { highestDegree: "PHD", teachingYears: 11, postPhdYears: 6, publicationsJson: pubs(12, "OTHER") }).eligible, false, "only HEC-recognised journals count");
  assert.equal(eligibility("LECTURER", { highestDegree: "MASTERS16", teachingYears: 0, postPhdYears: 0, publicationsJson: "[]" }).eligible, true);
  const a = score({ highestDegree: "PHD", teachingYears: 15, industryYears: 0, publicationsJson: pubs(5, "W") }, DEFAULT_WEIGHTS, 100);
  assert.equal(a.total, 100);
  const b = score({ highestDegree: "MASTERS16", teachingYears: 0, industryYears: 0, publicationsJson: "[]" }, DEFAULT_WEIGHTS, null);
  assert.ok(b.total > 0 && b.total < 10);
});

test("research: BibTeX and pasted lists are read; titles de-duplicate whatever the punctuation", () => {
  const items = parseBibtex(`@article{a, title={Deep {Learning} for Urdu OCR}, author={Ali, A. and Khan, B.}, journal={IEEE Access}, year={2024}, doi={10.1109/X}}\n@inproceedings{b, title="Edge AI", booktitle="ICET", year=2023}`);
  assert.equal(items.length, 2);
  assert.deepEqual([items[0].title, items[0].journal, items[0].year, items[0].doi, items[0].authors], ["Deep Learning for Urdu OCR", "IEEE Access", 2024, "10.1109/X", "Ali, A.; Khan, B."]);
  assert.equal(items[1].journal, "ICET");
  assert.equal(parseLines("A paper title here | Some Journal | 2022 | 10.1/y | 7")[0].citations, 7);
  assert.equal(dedupeKey("Deep Learning, for Urdu OCR!"), dedupeKey("deep learning for urdu ocr"));
});

// ------------------------------------------------------------------------------------------------ batch 4: billing
import { periodOf } from "../lib/billing";

test("billing: periods (month, term, year) end on their last day in every time zone", () => {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const [ms, me] = periodOf("MONTHLY", new Date("2026-02-14T10:00:00Z")); assert.deepEqual([iso(ms), iso(me)], ["2026-02-01", "2026-02-28"]);
  const [ts, te] = periodOf("TERM", new Date("2026-10-24T10:00:00Z")); assert.deepEqual([iso(ts), iso(te)], ["2026-07-01", "2026-12-31"]);
  const [ss, se] = periodOf("TERM", new Date("2026-03-01T10:00:00Z")); assert.deepEqual([iso(ss), iso(se)], ["2026-01-01", "2026-06-30"]);
  const [ys, ye] = periodOf("YEARLY", new Date("2026-05-05T10:00:00Z")); assert.deepEqual([iso(ys), iso(ye)], ["2026-01-01", "2026-12-31"]);
  assert.equal(te.getUTCHours(), 12, "midday, so local time shows the same day");
});

test("billing: read-only blocks changes, never reads, and locks are applied through the module locks", () => {
  const src = read("lib/billing.ts");
  assert.match(src, /\["GET", "HEAD", "OPTIONS"\]\.includes\(method\.toUpperCase\(\)\)/);
  assert.match(src, /late > s\.graceDays \+ s\.readOnlyDays \? "LOCKED" : late > s\.graceDays \? "READ_ONLY" : "NONE"/);
  assert.match(src, /for \(const k of byBilling\) current\.delete\(k\)/, "paying removes only the locks billing added");
  assert.match(read("lib/session.ts"), /blockedWrite\(inst, reqPath, method\)/);
});
