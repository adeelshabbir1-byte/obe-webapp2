import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SETTINGS, DEFAULT_WARN, SEED_TYPES, canExclude, checkWeights, classClo, compareMethods, countsInCloMarks, courseGradePct, defaultLabRows, diagnose,
  escalationStage, faultyFlags, labAhead, limitBreaches, mappingIssues, marksDue, marksStatus, methodForTerm, parseMarkCell, passesLabRule, peerAdjusted,
  resolveSettings, rubricSplit, studentClo, warningLevel, warningRecipients, workdayNumber, type CItem, type MethodSettings,
} from "../lib/cloMethodCore";
import type { WorkCal } from "../lib/workdays";

// The prompt's dataset: one CLO, four items; the student scores 10, 18, 3, 6.
const C = "clo1";
const it = (id: string, label: string, type: string, max: number, grade: number, w: number, q = false): CItem => ({ id, label, type, part: "THEORY", maxMarks: max, gradePct: grade, isQuestion: q, clos: [{ cloId: C, pct: 100 }], weights: { [C]: w } });
const items = [it("q", "Quiz", "Quiz", 10, 5, 10), it("a", "Assignment", "Assignment", 20, 10, 20), it("m", "Mid Q2", "Midterm", 15, 10, 30, true), it("f", "Final Q4", "Final", 20, 15, 40, true)];
const marks = { q: 10, a: 18, m: 3, f: 6 };
const S = (method: MethodSettings["method"]): MethodSettings => ({ ...DEFAULT_SETTINGS, method });

test("the four methods on the prompt's dataset", () => {
  const m1 = studentClo(S("SUM"), items, C, marks); assert.equal(m1.pct, 56.92); assert.equal(m1.status, "CLEARED");
  const m2 = studentClo(S("ITEMS"), items, C, marks); assert.equal(m2.pct, 50); assert.equal(m2.status, "CLEARED");
  const m3 = studentClo(S("WEIGHTS"), items, C, marks); assert.equal(m3.pct, 46); assert.equal(m3.status, "NOT_CLEARED");
  const m4 = studentClo(S("GRADE"), items, C, marks); assert.equal(m4.pct, 51.25); assert.equal(m4.status, "CLEARED");
  assert.equal(DEFAULT_SETTINGS.method, "GRADE");
  assert.equal(compareMethods(DEFAULT_SETTINGS, items, C, [marks]).length, 4);
});

test("blank = absent (left out, also of the class average); 0 counts", () => {
  const blank = studentClo(S("SUM"), items, C, { ...marks, m: null });
  assert.equal(blank.pct, Math.round((100 * 34) / 50 * 100) / 100); // 10+18+6 of 10+20+20
  const zero = studentClo(S("SUM"), items, C, { ...marks, m: 0 });
  assert.equal(zero.pct, Math.round((100 * 34) / 65 * 100) / 100);
  // Mid Q2 class average: the absent student is not counted.
  const flags = faultyFlags([items[2]], [{ m: 3 }, { m: null }, { m: 4 }]);
  assert.equal(flags[0].avg, 23.33);
  const all = studentClo(S("GRADE"), items, C, { q: null, a: undefined, m: null, f: null });
  assert.equal(all.status, "NOT_ASSESSED");
  const cls = classClo(S("GRADE"), items, C, [marks, { q: null, a: null, m: null, f: null }]);
  assert.equal(cls.notAssessed, 1); assert.equal(cls.assessed, 1); assert.equal(cls.clearedPct, 100);
  assert.deepEqual([parseMarkCell(""), parseMarkCell("A"), parseMarkCell("Abs"), parseMarkCell("0"), parseMarkCell(7)].map((x) => (x.ok ? x.value : "err")), [null, null, null, 0, 7]);
});

test("a question mapped to 2 CLOs split 60/40 contributes 60% and 40% of its marks", () => {
  const q: CItem = { id: "x", label: "Final Q1", type: "Final", part: "THEORY", maxMarks: 10, gradePct: 10, isQuestion: true, clos: [{ cloId: "A", pct: 60 }, { cloId: "B", pct: 40 }] };
  const other: CItem = { id: "y", label: "Quiz", type: "Quiz", part: "THEORY", maxMarks: 10, gradePct: 10, isQuestion: false, clos: [{ cloId: "A", pct: 100 }] };
  // Method 1 on CLO A: 6/6 from Q1 + 0/10 from the quiz → 6 / 16.
  assert.equal(studentClo(S("SUM"), [q, other], "A", { x: 10, y: 0 }).pct, 37.5);
  // On CLO B the question alone: 4 of 4.
  assert.equal(studentClo(S("SUM"), [q, other], "B", { x: 10, y: 0 }).pct, 100);
});

test("mapping rules: unmapped question blocks; Not for CLO quiz allowed and left out; coverage", () => {
  const clos = [{ id: C, code: "CLO-1", part: "THEORY" as const }];
  const unmapped = mappingIssues([...items, { ...it("u", "Mid Q3", "Midterm", 5, 5, 0, true), clos: [] }], clos, { hasLab: false });
  assert.ok(unmapped.blocking.includes("Mid Q3 is not mapped to any CLO."));
  const bonus = { ...it("b", "Bonus quiz", "Quiz", 5, 2, 0), clos: [], notForClo: true };
  assert.deepEqual(mappingIssues([...items, bonus], clos, { hasLab: false, notForCloReasons: { b: "Bonus" } }).blocking, []);
  assert.equal(studentClo(S("SUM"), [...items, bonus], C, { ...marks, b: 0 }).pct, 56.92);
  const noExam = mappingIssues([items[0]], clos, { hasLab: false });
  assert.ok(noExam.blocking.includes("CLO-1 has no mid or final question."));
});

test("faulty: class average 22% flags it; marking it faulty leaves it out and re-normalises", () => {
  const flags = faultyFlags(items, [{ ...marks, m: 3.3, f: 12 }, { ...marks, m: 3.3, f: 12 }]);
  assert.deepEqual(flags.map((f) => f.text), ["Mid Q2: class average 22% — check the question"]);
  const faulty = items.map((x) => (x.id === "m" ? { ...x, faulty: true } : x));
  // Method 4 without Mid Q2: (5×100 + 10×90 + 15×30) / 30.
  assert.equal(studentClo(S("GRADE"), faulty, C, marks).pct, 61.67);
  // Method 3: weights 10/20/40 renormalised.
  assert.equal(studentClo(S("WEIGHTS"), faulty, C, marks).pct, Math.round(((10 * 100 + 20 * 90 + 40 * 30) / 70) * 100) / 100);
  // Method 2: 2 of 3 items.
  assert.equal(studentClo(S("ITEMS"), faulty, C, marks).pct, 66.67);
});

test("limits under the method: Quiz + Assignment 35% under method 4 flagged against 20%; method 3 weights refused", () => {
  const lim = [{ label: "Quiz + Assignment ≤ 20% of each CLO", types: ["Quiz", "Assignment"], minPct: null, maxPct: 20 }];
  const g = [it("q", "Quiz", "Quiz", 10, 15, 0), it("a", "Assignment", "Assignment", 10, 20, 0), it("f", "Final Q1", "Final", 10, 65, 0, true)];
  const b = limitBreaches("GRADE", g, [{ id: C, code: "CLO-2" }], lim);
  assert.equal(b[0].text, "CLO-2: quizzes + assignments are 35% (limit 20%)");
  const w = g.map((x, i) => ({ ...x, weights: { [C]: [20, 15, 65][i] } }));
  assert.match(checkWeights(w, { id: C, code: "CLO-2" }, lim)!, /^CLO-2: quizzes \+ assignments are 35%/);
  assert.match(checkWeights(g.map((x) => ({ ...x, weights: { [C]: 30 } })), { id: C, code: "CLO-2" }, lim)!, /add up to 90/);
  assert.equal(checkWeights(g.map((x, i) => ({ ...x, weights: { [C]: [10, 10, 80][i] } })), { id: C, code: "CLO-2" }, lim), null);
  // Excluding the final would leave only quiz + assignment: refused.
  assert.ok(canExclude("GRADE", g, "f", [{ id: C, code: "CLO-2" }], lim));
});

test("lab: no lab CLO blocks; lab share; separate pass rule; participation not for CLO; 15 × 3 h plan; lab ahead of theory", () => {
  assert.ok(mappingIssues(items, [{ id: C, code: "CLO-1", part: "THEORY" }], { hasLab: true }).blocking.includes("This course has a lab but no lab CLO."));
  assert.equal(courseGradePct(20, 30), 6);
  assert.equal(passesLabRule(45, { on: true, minPct: 50 }), false);
  assert.equal(passesLabRule(45, { on: false, minPct: 50 }), true);
  assert.equal(SEED_TYPES.find((t) => t.name === "Class participation")!.defaultNotForClo, true);
  const rows = defaultLabRows();
  assert.equal(rows.length, 15); assert.ok(rows.every((r) => r.hours === 3));
  rows[4].topics = [{ lectureNumber: 12, topic: "Recursion" }];
  const lectures = [{ lectureNumber: 12, week: 6, topic: "Recursion" }];
  assert.deepEqual(labAhead(rows, lectures).map((x) => x.text), ["Lab 5 (Week 5) practises Recursion — taught in L12 (Week 6)"]);
  assert.equal(labAhead(rows, [{ lectureNumber: 12, week: 5, topic: "Recursion" }]).length, 0);
});

test("early warning: 6 of 10 below → red to the theory teacher; 45% amber; absent left out; escalation 3 + 3 days", () => {
  const six = [2, 3, 4, 1, 2, 3, 8, 9, 7, 10];
  assert.equal(warningLevel(six, 10, DEFAULT_WARN).level, "RED");
  const amber = [...Array(9).fill(2), ...Array(11).fill(8)];
  assert.equal(warningLevel(amber, 10, DEFAULT_WARN).belowPct, 45); assert.equal(warningLevel(amber, 10, DEFAULT_WARN).level, "AMBER");
  assert.equal(warningLevel([...six.slice(6), null, null, null], 10, DEFAULT_WARN).sat, 4);
  assert.deepEqual(warningRecipients({ part: "LAB", teacherId: "le", theoryTeacherId: "t", labEngineerId: "le", seId: "se" }), { to: ["t"], cc: ["le", "se"] });
  const t0 = new Date("2026-11-02T08:00:00Z");
  assert.equal(escalationStage(t0, new Date(t0.getTime() + 2 * 864e5), null, DEFAULT_WARN), "TEACHER");
  assert.equal(escalationStage(t0, new Date(t0.getTime() + 3 * 864e5), null, DEFAULT_WARN), "SE");
  assert.equal(escalationStage(t0, new Date(t0.getTime() + 6 * 864e5), null, DEFAULT_WARN), "HOD");
  assert.equal(diagnose({ thisBelowPct: 68, otherPartBelowPct: 20, classOtherItemsBelowPct: 30 }).kind, "PRACTICE");
  assert.equal(diagnose({ thisBelowPct: 68, otherPartBelowPct: 70, classOtherItemsBelowPct: 60 }).kind, "TEACHING");
});

test("marks within one week: due Thursday → Thursday; holiday moves it; reminders 4–5, red 6, HOD 8, late on 7; PL setting wins", () => {
  const cal: WorkCal = { off: new Set(), weekend: [0, 6], names: new Map() };
  const thu = new Date("2026-11-05T00:00:00Z"); // a Thursday
  assert.equal(marksDue(cal, thu, 5).toISOString().slice(0, 10), "2026-11-12");
  const hol: WorkCal = { off: new Set(["2026-11-10"]), weekend: [0, 6], names: new Map() };
  assert.equal(marksDue(hol, thu, 5).toISOString().slice(0, 10), "2026-11-13");
  const day = (d: string) => new Date(`${d}T09:00:00Z`);
  assert.equal(workdayNumber(cal, thu, day("2026-11-11")), 4);
  assert.equal(marksStatus(cal, thu, day("2026-11-11"), null, DEFAULT_WARN).remind, true);
  assert.equal(marksStatus(cal, thu, day("2026-11-12"), null, DEFAULT_WARN).remind, true);
  assert.equal(marksStatus(cal, thu, day("2026-11-13"), null, DEFAULT_WARN).stage, "OVERDUE");
  assert.equal(marksStatus(cal, thu, day("2026-11-17"), null, DEFAULT_WARN).stage, "ESCALATED");
  assert.equal(marksStatus(cal, thu, day("2026-11-17"), null, DEFAULT_WARN).escalate, true);
  assert.equal(marksStatus(cal, thu, day("2026-11-16"), day("2026-11-16"), DEFAULT_WARN).late, true);
  assert.equal(marksStatus(cal, thu, day("2026-11-12"), day("2026-11-12"), DEFAULT_WARN).late, false);
  const dept = { ...DEFAULT_WARN }, mine = resolveSettings(dept, { marksDays: 7 }), other = resolveSettings(dept, null);
  assert.equal(mine.marksDays, 7); assert.equal(other.marksDays, 5);
  assert.equal(marksDue(cal, thu, mine.marksDays).toISOString().slice(0, 10), "2026-11-16");
});

test("types: rubric criteria map to their own CLOs; peer assessment; surveys never count", () => {
  assert.deepEqual(rubricSplit([{ cloId: "A", max: 6 }, { cloId: "B", max: 4 }]), [{ cloId: "A", pct: 60 }, { cloId: "B", pct: 40 }]);
  const p = peerAdjusted(16, 20, { s1: 5, s2: 3, s3: 4 });
  assert.equal(p.s1, 20); assert.equal(p.s2, 12); assert.equal(p.s3, 16);
  for (const t of SEED_TYPES.filter((x) => /survey/i.test(x.name))) assert.equal(countsInCloMarks(t), false);
  assert.ok(SEED_TYPES.some((t) => t.ccp));
});

test("a term's locked method is used unless the OMC recalculates", () => {
  const locked = { settings: S("SUM") };
  assert.equal(methodForTerm(locked, S("ITEMS")).method, "SUM");
  assert.equal(methodForTerm({ ...locked, recalculated: S("ITEMS") }, S("WEIGHTS")).method, "ITEMS");
  assert.equal(methodForTerm(null, S("WEIGHTS")).method, "WEIGHTS");
});
