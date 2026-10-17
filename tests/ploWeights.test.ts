import { test } from "node:test";
import assert from "node:assert/strict";
import { affinity, courseFamily, normalise, equalWeights, suggestedWeights, checkWeights, weightedAttainment, cohortWeights } from "../lib/ploWeightMath";

const core = { id: "pf", courseType: "Core", creditHours: 4 };
const ge = { id: "comm", courseType: "General Education", creditHours: 3 };
const ids = { id: "mkt", courseType: "IDS", creditHours: 3 };
const fyp = { id: "fyp", courseType: "Capstone Project", creditHours: 6 };
const sum = (o: Record<string, number>) => Math.round(Object.values(o).reduce((a, b) => a + b, 0) * 100) / 100;

test("course families", () => {
  assert.equal(courseFamily("Core"), "COMPUTING");
  assert.equal(courseFamily("Elective"), "COMPUTING");
  assert.equal(courseFamily("General Education"), "GENERAL");
  assert.equal(courseFamily("IDS"), "GENERAL");
  assert.equal(courseFamily("Capstone Project"), "CAPSTONE");
});

test("computing weighs 3x on PLO 1-5, GE/IDS 3x on PLO 6-10, capstone 2x on both, times credit hours", () => {
  assert.equal(affinity(core, 2), 12); assert.equal(affinity(core, 7), 4);
  assert.equal(affinity(ge, 2), 3); assert.equal(affinity(ge, 7), 9);
  assert.equal(affinity(fyp, 2), 12); assert.equal(affinity(fyp, 9), 12);
});

test("equal split: 3 courses get 33.33/33.33/33.34 and always total 100", () => {
  const e = equalWeights([core, ge, ids]);
  assert.equal(sum(e), 100);
  assert.deepEqual(Object.values(e).sort(), [33.33, 33.33, 33.34]);
  assert.deepEqual(equalWeights([]), {});
});

test("suggestion: computing leads a technical PLO, GE leads a soft-skill PLO, totals 100", () => {
  const t = suggestedWeights([core, ge], 3); // 12 vs 3
  assert.equal(t.pf, 80); assert.equal(t.comm, 20);
  const s = suggestedWeights([core, ge], 7); // 4 vs 9
  assert.ok(s.comm > s.pf); assert.equal(sum(s), 100);
  assert.equal(sum(suggestedWeights([core, ge, ids, fyp], 8)), 100);
});

test("weights are checked: every course, no negatives, total 100", () => {
  assert.equal(checkWeights(["a", "b"], { a: 60, b: 40 }), null);
  assert.equal(checkWeights(["a", "b"], { a: 50.02, b: 49.99 }), null);
  assert.match(checkWeights(["a", "b"], { a: 60 })!, /no weight/);
  assert.match(checkWeights(["a", "b"], { a: 60, b: 30 })!, /90%/);
  assert.match(checkWeights(["a"], { a: -1 })!, /negative/);
});

test("batch attainment is the weighted average; courses without results are left out", () => {
  assert.equal(weightedAttainment({ a: 40, b: 60 }, { a: 50, b: 80 }), 68);
  assert.equal(weightedAttainment({ a: 40, b: 60 }, { a: 50, b: null }), 50);
  assert.equal(weightedAttainment({ a: 100 }, { a: null }), null);
});

test("cohort suggestion tilts toward courses the last batch did best in, within 0.5x-1.5x", () => {
  const a = { id: "a", courseType: "Core", creditHours: 3 }, b = { id: "b", courseType: "Core", creditHours: 3 };
  const w = cohortWeights([a, b], 2, { a: 80, b: 40 }); // factors 1.33 and 0.67
  assert.ok(w.a > w.b); assert.equal(sum(w), 100);
  assert.deepEqual(cohortWeights([a, b], 2, { a: null, b: null }), { a: 50, b: 50 });
  const extreme = cohortWeights([a, b], 2, { a: 100, b: 1 }); // capped at 1.5 vs 0.5
  assert.equal(extreme.a, 75);
});

test("normalise never loses the rounding remainder", () => {
  assert.equal(sum(normalise([{ id: "x", w: 1 }, { id: "y", w: 1 }, { id: "z", w: 1 }, { id: "q", w: 1 }, { id: "r", w: 1 }, { id: "s", w: 1 }, { id: "t", w: 1 }])), 100);
});
