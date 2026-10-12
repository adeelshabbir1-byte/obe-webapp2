import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateCoverage } from "../lib/ploCoverage";
import { coverageRules } from "../lib/weightPolicy";
import { validateCriteria, scoreFor, type Criterion } from "../lib/rubrics";
import { isTeachingTopic } from "../lib/courseProgress";
import { isExamTopic } from "../lib/teachingAnalysis";
import { guessPloByWording } from "../lib/benchmarkCopy";
import { workingDaysSince } from "../lib/inactivity";

test("exam and review slots are not teaching topics", () => {
  for (const t of ["Midterm Exam", "Mid-term examination", "Final Exam Review", "Midterm Review"]) assert.ok(!isTeachingTopic(t), t);
  for (const t of ["Business Models", "Final project presentations"]) assert.ok(isTeachingTopic(t), t);
  assert.ok(isExamTopic("Mid Term Exam"));
  assert.ok(!isExamTopic("Pitching a Venture"));
});

test("OMC coverage: CLO and PLO lecture minimums, PLO marks and items", () => {
  const rules = coverageRules({ cloMinTopics: 3, ploMinTopics: 4, ploMinPct: 10, ploMinItems: 2 } as never);
  const clos = [{ id: "c1", code: "CLO-1", mappedPloId: "p1", ploNumber: 1 }, { id: "c2", code: "CLO-2", mappedPloId: "p2", ploNumber: 2 }];
  const rows = [
    ...[1, 2, 3, 4].map((i) => ({ cloId: "c1", weightPct: 5, topic: `Topic ${i}`, instrumentIds: [i % 2 ? "q1" : "q2"] })),
    { cloId: "c1", weightPct: 30, topic: "Midterm Exam", instrumentIds: ["mid"] }, // exam slot: marks count, topic does not
    { cloId: "c2", weightPct: 5, topic: "Topic 5", instrumentIds: ["q3"] },
  ];
  const r = evaluateCoverage(rules, { clos, rows });
  assert.ok(r.topicShort.some((s) => s.includes("CLO-2 has 1")), r.topicShort.join("|"));
  assert.ok(!r.topicShort.some((s) => s.includes("CLO-1")));
  assert.ok(r.topicShort.some((s) => s.startsWith("PLO-2 has 1")));
  assert.ok(r.assessShort.some((s) => s.startsWith("PLO-2:") && s.includes("5% of marks") && s.includes("1 assessment item")));
  assert.ok(!r.assessShort.some((s) => s.startsWith("PLO-1")));
  const none = evaluateCoverage(coverageRules({ cloMinTopics: 0 } as never), { clos, rows });
  assert.deepEqual(none.short, []);
});

test("default OMC rule is 3 lecture topics per CLO", () => {
  assert.equal(coverageRules(null as never).cloMinTopics, 3);
});

test("rubric: weights must total 100 and every criterion needs scored levels", () => {
  const lv = [{ label: "Good", points: 2, descriptor: "" }, { label: "Poor", points: 0, descriptor: "" }];
  assert.ok("error" in validateCriteria([{ title: "A", weight: 60, levels: lv }], new Set()));
  assert.ok("error" in validateCriteria([{ title: "A", weight: 100, levels: [lv[1], lv[1]] }], new Set()));
  const ok = validateCriteria([{ title: "A", weight: 60, levels: lv, cloId: "c1" }, { title: "B", weight: 40, levels: lv, cloId: "nope" }], new Set(["c1"]));
  assert.ok("criteria" in ok);
  if ("criteria" in ok) { assert.equal(ok.criteria[0].cloId, "c1"); assert.equal(ok.criteria[1].cloId, null); }
});

test("rubric score: weighted share of top points, scaled to the item; attained from half the points", () => {
  const crit: Criterion[] = [
    { id: "a", title: "A", cloId: null, weight: 60, levels: [{ label: "4", points: 4, descriptor: "" }, { label: "2", points: 2, descriptor: "" }, { label: "1", points: 1, descriptor: "" }] },
    { id: "b", title: "B", cloId: null, weight: 40, levels: [{ label: "4", points: 4, descriptor: "" }, { label: "0", points: 0, descriptor: "" }] },
  ];
  const s = scoreFor(crit, { a: 1, b: 0 }, 20)!; // A: 2/4 of 60 = 30, B: 40 -> 70% of 20 = 14
  assert.equal(s.score, 14);
  assert.equal(s.pct, 70);
  assert.deepEqual(s.attained, { a: true, b: true });
  assert.equal(scoreFor(crit, { a: 2, b: 1 }, 20)!.attained.a, false);
  assert.equal(scoreFor(crit, { a: 0 }, 20), null);
});

test("CLO wording points to the right PLO (HEC load)", () => {
  const plos = [6, 7, 8, 10].map((n) => ({ id: `p${n}`, title: { 6: "Individual and Team Work", 7: "Communication", 8: "Computing Professionalism and Society", 10: "Life-long Learning" }[n]! }));
  assert.equal(guessPloByWording("Explain the concepts of entrepreneurship and the role of new ventures in the economy and society.", plos), "p8");
  assert.equal(guessPloByWording("Identify and evaluate business opportunities using market research.", plos), "p10");
  assert.equal(guessPloByWording("Develop a business plan while working in a team.", plos), "p6");
  assert.equal(guessPloByWording("Prepare the financial plan and legal and risk assessment of a venture.", plos), "p8");
  assert.equal(guessPloByWording("Communicate and pitch a business plan to investors.", plos), "p7");
  assert.equal(guessPloByWording("Solve differential equations.", plos), null);
});

test("sign-in watch counts whole working days missed, skipping weekends and leave", () => {
  const now = new Date("2026-10-15T04:00:00Z"); // Thursday morning in Pakistan
  assert.equal(workingDaysSince(new Date("2026-10-12T10:00:00Z"), now, [0, 6], () => false), 2); // Mon -> Tue, Wed
  assert.equal(workingDaysSince(new Date("2026-10-09T10:00:00Z"), now, [0, 6], () => false), 3); // Fri -> Mon, Tue, Wed
  assert.equal(workingDaysSince(new Date("2026-10-09T10:00:00Z"), now, [0, 6], (k) => k === "2026-10-13"), 2); // leave on Tue
  assert.equal(workingDaysSince(new Date("2026-10-14T20:00:00Z"), now, [0, 6], () => false), 0); // seen late last night
});
