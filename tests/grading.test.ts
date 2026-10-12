import { test } from "node:test";
import assert from "node:assert/strict";
import { classStats, suggestedGrade, gradeWithCutoffs } from "../lib/grading";
import { bestAttemptTotals } from "../lib/cgpaMath";

test("class mean and sample SD", () => {
  const { mean, sd } = classStats([50, 60, 70, 80, 90]);
  assert.equal(mean, 70);
  assert.ok(Math.abs(sd - 15.811) < 0.001);
  assert.deepEqual(classStats([]), { mean: 0, sd: 0 });
  assert.deepEqual(classStats([77]), { mean: 77, sd: 0 });
});

test("relative grading bands: A from mean+SD, B from mean, C from mean-SD, D from mean-2SD", () => {
  const g = (p: number) => suggestedGrade(p, 60, 10);
  assert.equal(g(70), "A");
  assert.equal(g(69.9), "B");
  assert.equal(g(60), "B");
  assert.equal(g(59.9), "C");
  assert.equal(g(50), "C");
  assert.equal(g(40), "D");
  assert.equal(g(39.9), "F");
});

test("saved cutoffs win over the suggestion, in any order, with the lowest letter as floor", () => {
  const cut = [{ letter: "C", minPercent: 50 }, { letter: "A", minPercent: 85 }, { letter: "B", minPercent: 70 }, { letter: "F", minPercent: 0 }];
  assert.equal(gradeWithCutoffs(90, cut, 60, 10), "A");
  assert.equal(gradeWithCutoffs(85, cut, 60, 10), "A");
  assert.equal(gradeWithCutoffs(84.9, cut, 60, 10), "B");
  assert.equal(gradeWithCutoffs(50, cut, 60, 10), "C");
  assert.equal(gradeWithCutoffs(10, cut, 60, 10), "F");
  // No 0% cutoff saved: below every cutoff the lowest saved letter applies.
  assert.equal(gradeWithCutoffs(10, [{ letter: "A", minPercent: 85 }, { letter: "D", minPercent: 40 }], 60, 10), "D");
  assert.equal(gradeWithCutoffs(65, [], 60, 10), "B");
});

test("CGPA counts only the best attempt of a repeated course and skips ungraded attempts", () => {
  const t = bestAttemptTotals([
    { courseCode: "CS101", creditHours: 3, gpaPoints: 0 },
    { courseCode: "cs101 ", creditHours: 3, gpaPoints: 3 },
    { courseCode: "MA101", creditHours: 3, gpaPoints: 4 },
    { courseCode: "SS100", creditHours: 2, gpaPoints: null },
  ]);
  assert.deepEqual(t, { points: 21, credits: 6 });
  assert.equal(t.points / t.credits, 3.5);
});
